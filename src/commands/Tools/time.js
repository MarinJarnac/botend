import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Obtenir l\'heure actuelle dans différents fuseaux horaires')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('Le fuseau horaire à afficher (ex: UTC, Europe/Paris, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'Europe/Paris';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('fr-FR', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (error) {
                    logger.warn(`Fuseau horaire invalide demandé : ${timezone}`);
                    const embed = errorEmbed('Fuseau horaire invalide', 'Fuseau horaire invalide. Veuillez utiliser un identifiant valide (ex: UTC, Europe/Paris, America/New_York, Europe/London)');
                    embed.setColor(getColor('error'));
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [embed],
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '🕒 Heure actuelle',
                    `**Fuseau horaire :** \`${timezone}\`\n` +
                    `**Date et heure :** ${timeString}\n` +
                    `**Timestamp Unix :** \`${unixTimestamp}\`\n` +
                    `**Chaîne ISO :** \`${now.toISOString()}\``
                );

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            'Impossible de récupérer l\'heure actuelle. Veuillez réessayer.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};
