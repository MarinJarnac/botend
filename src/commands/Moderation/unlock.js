import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Déverrouille le salon actuel (autorise à nouveau @everyone à envoyer des messages).",
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        )
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission refusée",
                        "Vous avez besoin de la permission `Gérer les salons` pour déverrouiller des salons.",
                    ),
                ],
            });

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Salon déjà déverrouillé",
                            `Le salon ${channel} n'est pas explicitement verrouillé (tout le monde peut déjà y envoyer des messages).`,
                        ),
                    ],
                });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Salon déverrouillé par ${interaction.user.tag}`,
                },
            );

            const unlockEmbed = createEmbed(
                "🔓 Salon déverrouillé (Log d'action)",
                `Le salon ${channel} a été déverrouillé par ${interaction.user}.`,
            )
.setColor(getColor('success'))
                .addFields(
                    {
                        name: "Salon",
                        value: channel.toString(),
                        inline: true,
                    },
                    {
                        name: "Modérateur",
                        value: `${interaction.user.tag} (${interaction.user.id})`,
                        inline: true,
                    },
                );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Channel Unlocked",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || 'Aucune'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **Salon déverrouillé**`,
                        `Le salon ${channel} est désormais déverrouillé. Vous pouvez de nouveau écrire.`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Une erreur inattendue est survenue lors du déverrouillage du salon. Vérifiez mes permissions (j'ai besoin de la permission 'Gérer les salons').",
                    ),
                ],
            });
        }
    }
};
