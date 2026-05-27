import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = 50;
const MAX_WIN = 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Mendier pour obtenir une petite somme d\'argent'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Impossible de charger vos données économiques. Veuillez réessayer plus tard.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} minute(s)` : `${seconds} seconde(s)`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous êtes trop fatigué pour mendier ! Réessayez dans **${timeMessage}**.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `Un gentil inconnu dépose **$${amountWon.toLocaleString()}** dans votre gobelet.`,
                    `Vous apercevez un portefeuille sans surveillance ! Vous y prenez **$${amountWon.toLocaleString()}** avant de détaler.`,
                    `Quelqu'un a pitié de vous et vous donne **$${amountWon.toLocaleString()}** !`,
                    `Vous trouvez un billet de **$${amountWon.toLocaleString()}** sous un banc public.`,
                ];

                replyEmbed = MessageTemplates.SUCCESS.DATA_UPDATED(
                    "begging",
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "La police vous a pris en chasse. Vous n'obtenez rien.",
                    "Quelqu'un vous crie : « Trouve un travail ! » en passant son chemin.",
                    "Un écureuil vous a volé la seule pièce que vous aviez.",
                    "Vous avez essayé de mendier, mais vous étiez trop embarrassé et vous avez abandonné.",
                ];

                replyEmbed = MessageTemplates.ERRORS.INSUFFICIENT_FUNDS(
                    "nothing",
                    "Vous n'avez pas réussi à récolter d'argent."
                );
                replyEmbed.data.description = failMessages[Math.floor(Math.random() * failMessages.length)];
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
