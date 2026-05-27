import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ROB_COOLDOWN = 4 * 60 * 60 * 1000;
const BASE_ROB_SUCCESS_CHANCE = 0.25;
const ROB_PERCENTAGE = 0.15;
const FINE_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Tenter de voler un autre utilisateur (très risqué)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('L\'utilisateur à voler')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const robberId = interaction.user.id;
            const victimUser = interaction.options.getUser("user");
            const guildId = interaction.guildId;
            const now = Date.now();

            if (robberId === victimUser.id) {
                throw createError(
                    "Cannot rob self",
                    ErrorTypes.VALIDATION,
                    "Vous ne pouvez pas vous voler vous-même.",
                    { robberId, victimId: victimUser.id }
                );
            }
            
            if (victimUser.bot) {
                throw createError(
                    "Cannot rob bot",
                    ErrorTypes.VALIDATION,
                    "Vous ne pouvez pas voler un bot.",
                    { victimId: victimUser.id, isBot: true }
                );
            }

            const robberData = await getEconomyData(client, guildId, robberId);
            const victimData = await getEconomyData(client, guildId, victimUser.id);
            
            if (!robberData || !victimData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Impossible de charger les données économiques. Veuillez réessayer plus tard.",
                    { robberId: !!robberData, victimId: !!victimData, guildId }
                );
            }
            
            const lastRob = robberData.lastRob || 0;

            if (now < lastRob + ROB_COOLDOWN) {
                const remaining = lastRob + ROB_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                throw createError(
                    "Robbery cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous devez vous faire discret. Attendez **${hours}h ${minutes}m** avant de tenter un autre braquage.`,
                    { remaining, hours, minutes, cooldownType: 'rob' }
                );
            }

            if (victimData.wallet < 500) {
                throw createError(
                    "Victim too poor",
                    ErrorTypes.VALIDATION,
                    `**${victimUser.username}** est trop pauvre. Cette personne doit avoir au moins $500 en liquide pour que le vol en vaille la peine.`,
                    { victimWallet: victimData.wallet, required: 500 }
                );
            }

            const hasSafe = victimData.inventory["personal_safe"] || 0;

            if (hasSafe > 0) {
                robberData.lastRob = now;
                await setEconomyData(client, guildId, robberId, robberData);

                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        MessageTemplates.ERRORS.CONFIGURATION_REQUIRED(
                            "robbery protection",
                            `**${victimUser.username}** était préparé ! Votre tentative a échoué car cette personne possède un **Coffre-fort Personnel**. Vous avez filé en douce sans vous faire prendre, mais vous n'avez rien gagné.`
                        )
                    ],
                });
            }

            const isSuccessful = Math.random() < BASE_ROB_SUCCESS_CHANCE;
            let resultEmbed;

            if (isSuccessful) {
                const amountStolen = Math.floor(victimData.wallet * ROB_PERCENTAGE);

                robberData.wallet = (robberData.wallet || 0) + amountStolen;
                victimData.wallet = (victimData.wallet || 0) - amountStolen;

                resultEmbed = MessageTemplates.SUCCESS.DATA_UPDATED(
                    "robbery",
                    `Braquage réussi ! Vous avez volé **$${amountStolen.toLocaleString()}** à **${victimUser.username}** !`
                );
            } else {
                const fineAmount = Math.floor((robberData.wallet || 0) * FINE_PERCENTAGE);

                if ((robberData.wallet || 0) < fineAmount) {
                    robberData.wallet = 0;
                } else {
                    robberData.wallet = (robberData.wallet || 0) - fineAmount;
                }

                resultEmbed = MessageTemplates.ERRORS.INSUFFICIENT_PERMISSIONS(
                    "robbery failed",
                    `Le vol a échoué et vous vous êtes fait prendre ! Vous avez écopé d'une amende de **$${fineAmount.toLocaleString()}** sur votre propre argent.`
                );
            }

            robberData.lastRob = now;

            await setEconomyData(client, guildId, robberId, robberData);
            await setEconomyData(client, guildId, victimUser.id, victimData);

            resultEmbed
                .addFields(
                    {
                        name: `Votre Nouveau Solde (${interaction.user.username})`,
                        value: `$${robberData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: `Solde de la Victime (${victimUser.username})`,
                        value: `$${victimData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({ text: `Prochain braquage disponible dans 4 heures.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'rob' })
};
