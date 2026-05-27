import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('withdraw')
        .setDescription('Retirer de l\'argent de votre banque vers votre portefeuille liquide')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Le montant à retirer')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const amountInput = interaction.options.getInteger("amount");

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Impossible de charger vos données économiques. Veuillez réessayer plus tard.",
                    { userId, guildId }
                );
            }

            let withdrawAmount = amountInput;

            if (withdrawAmount <= 0) {
                throw createError(
                    "Invalid withdrawal amount",
                    ErrorTypes.VALIDATION,
                    "Vous devez retirer un montant positif.",
                    { amount: withdrawAmount, userId }
                );
            }

            if (withdrawAmount > userData.bank) {
                withdrawAmount = userData.bank;
            }

            if (withdrawAmount === 0) {
                throw createError(
                    "Empty bank account",
                    ErrorTypes.VALIDATION,
                    "Votre compte bancaire est vide.",
                    { userId, bankBalance: userData.bank }
                );
            }

            userData.wallet += withdrawAmount;
            userData.bank -= withdrawAmount;

            await setEconomyData(client, guildId, userId, userData);

            const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
                "withdrawal",
                `Vous avez retiré avec succès **$${withdrawAmount.toLocaleString()}** de votre banque.`
            )
                .addFields(
                    {
                        name: "💵 Nouveau Solde en Liquide",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🏦 Nouveau Solde Bancaire",
                        value: `$${userData.bank.toLocaleString()}`,
                        inline: true,
                    },
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'withdraw' })
};
