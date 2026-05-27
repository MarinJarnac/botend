import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BASE_WIN_CHANCE = 0.4;
const CLOVER_WIN_BONUS = 0.1;
const CHARM_WIN_BONUS = 0.08;
const PAYOUT_MULTIPLIER = 2.0;
const GAMBLE_COOLDOWN = 5 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Parier votre argent pour tenter d\'en gagner plus')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Montant d\'argent liquide à parier')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const betAmount = interaction.options.getInteger("amount");
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastGamble = userData.lastGamble || 0;
            let cloverCount = userData.inventory["lucky_clover"] || 0;
            let charmCount = userData.inventory["lucky_charm"] || 0;

            if (now < lastGamble + GAMBLE_COOLDOWN) {
                const remaining = lastGamble + GAMBLE_COOLDOWN - now;
                const minutes = Math.floor(remaining / (1000 * 60));
                const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

                throw createError(
                    "Gamble cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous devez attendre un peu avant de parier à nouveau. Patientez **${minutes}m ${seconds}s**.`,
                    { remaining, cooldownType: 'gamble' }
                );
            }

            if (userData.wallet < betAmount) {
                throw createError(
                    "Insufficient cash for gamble",
                    ErrorTypes.VALIDATION,
                    `Vous ne possédez que $${userData.wallet.toLocaleString()} en liquide, mais vous essayez de parier $${betAmount.toLocaleString()}.`,
                    { required: betAmount, current: userData.wallet }
                );
            }

            let winChance = BASE_WIN_CHANCE;
            let cloverMessage = "";
            let usedClover = false;
            let usedCharm = false;

            
            if (cloverCount > 0) {
                winChance += CLOVER_WIN_BONUS;
                userData.inventory["lucky_clover"] -= 1;
                cloverMessage = `\n🍀 **Trèfle de la Chance consommé :** Vos chances de gagner ont été boostées !`;
                usedClover = true;
            }
            
            else if (charmCount > 0) {
                winChance += CHARM_WIN_BONUS;
                userData.inventory["lucky_charm"] -= 1;
                cloverMessage = `\n🍀 **Amulette de la Chance utilisée (${charmCount - 1} utilisations restantes) :** Vos chances de gagner ont été boostées !`;
                usedCharm = true;
            }

            const win = Math.random() < winChance;
            let cashChange = 0;
            let resultEmbed;

            if (win) {
                const amountWon = Math.floor(betAmount * PAYOUT_MULTIPLIER);
                cashChange = amountWon;

                resultEmbed = successEmbed(
                    "🎉 Vous avez gagné !",
                    `Votre pari est réussi ! Vous avez transformé votre mise de **$${betAmount.toLocaleString()}** en **$${amountWon.toLocaleString()}** !${cloverMessage}`,
                );
            } else {
                cashChange = -betAmount;

                resultEmbed = errorEmbed(
                    "💔 Vous avez perdu...",
                    `Les dés ont tourné en votre défaveur. Vous avez perdu votre mise de **$${betAmount.toLocaleString()}**.`,
                );
            }

            userData.wallet = (userData.wallet || 0) + cashChange;
            userData.lastGamble = now;

            await setEconomyData(client, guildId, userId, userData);

            const newCash = userData.wallet;

            resultEmbed.addFields({
                name: "💵 Nouveau Solde en Liquide",
                value: `$${newCash.toLocaleString()}`,
                inline: true,
            });

            if (usedClover) {
                resultEmbed.setFooter({
                    text: `Il vous reste ${userData.inventory["lucky_clover"]} Trèfle(s) de la Chance. Les chances de gagner étaient de ${Math.round(winChance * 100)}%.`,
                });
            } else if (usedCharm) {
                resultEmbed.setFooter({
                    text: `Il vous reste ${userData.inventory["lucky_charm"]} utilisation(s) d'Amulette. Les chances de gagner étaient de ${Math.round(winChance * 100)}%.`,
                });
            } else {
                resultEmbed.setFooter({
                    text: `Prochain pari disponible dans 5 minutes. Chances de gain de base : ${Math.round(BASE_WIN_CHANCE * 100)}%.`,
                });
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'gamble' })
};
