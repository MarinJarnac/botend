import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unixtime')
        .setDescription('Obtenir le timestamp Unix actuel'),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = successEmbed(
                    '⏱️ Timestamp Unix actuel',
                    `**Secondes depuis l'époque Unix :** \`${unixTimestamp}\`\n` +
                    `**Millisecondes depuis l'époque Unix :** \`${now.getTime()}\`\n\n` +
                    `**Format lisible (UTC) :** ${now.toUTCString()}\n` +
                    `**Chaîne ISO :** ${now.toISOString()}`
                );
                embed.setColor(getColor('success'));

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            },
            'Impossible de récupérer le timestamp unix. Veuillez réessayer.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};
