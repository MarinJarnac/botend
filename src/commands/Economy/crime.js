import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const CRIME_TYPES = [
    { name: "Pickpocketing", min: 100, max: 500, risk: 0.3, label: "Vol à la tire" },
    { name: "Burglary", min: 300, max: 1000, risk: 0.4, label: "Cambriolage" },
    { name: "Bank Heist", min: 1000, max: 5000, risk: 0.6, label: "Braquage de banque" },
    { name: "Art Theft", min: 2000, max: 10000, risk: 0.7, label: "Vol d'œuvre d'art" },
    { name: "Cybercrime", min: 5000, max: 20000, risk: 0.8, label: "Cybercriminalité" },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Commettre un crime pour gagner de l\'argent (risqué)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Le type de crime à commettre')
                .setRequired(true)
                .addChoices(
                    { name: 'Vol à la tire', value: 'pickpocketing' },
                    { name: 'Cambriolage', value: 'burglary' },
                    { name: 'Braquage de banque', value: 'bank-heist' },
                    { name: 'Vol d\'œuvre d\'art', value: 'art-theft' },
                    { name: 'Cybercriminalité', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `Vous êtes en prison pour encore ${timeLeft} minute(s) !`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous devez attendre encore ${timeLeft} minute(s) avant de commettre un autre crime.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "Veuillez sélectionner un type de crime valide.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            const crimeLabel = crime.label || crime.name;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "Crime Réussi !",
                    `Vous avez commis votre méfait (${crimeLabel}) avec succès et vous avez empoché **${amountEarned}** pièces !`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                const fine = Math.floor(amountEarned * 0.2);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = errorEmbed(
                    "Crime Échoué !",
                    `Vous vous êtes fait attraper en tentant l'action suivante : ${crimeLabel}. Vous avez été envoyé en prison !\n` +
                    `Vous écopez d'une amende de ${fine} pièces et vous resterez derrière les barreaux pendant 2 heures.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};
