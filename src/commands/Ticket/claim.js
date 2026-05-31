import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Prendre en charge un ticket ouvert et se l'assigner.")
        .setDMPermission(false),

    async execute(interaction, guildConfig, client) {
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) {
                return;
            }

            const permissionContext = await getTicketPermissionContext({ client, interaction });
            if (!permissionContext.ticketData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Salon invalide",
                            "Cette commande peut uniquement être utilisée dans un salon de ticket valide.",
                        ),
                    ],
                });
            }

            if (!permissionContext.canManageTicket) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Permission refusée",
                            "Vous devez disposer de la permission `Gérer les salons` ou du `Rôle Staff` configuré pour prendre en charge ce ticket.",
                        ),
                    ],
                });
            }

            const channel = interaction.channel;
            const result = await claimTicket(channel, interaction.user);
            
            if (!result.success) {
                logger.warn('Ticket claim failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: channel.id,
                    guildId: interaction.guildId,
                    error: result.error
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Salon invalide",
                            result.error || "Cette commande peut uniquement être utilisée dans un salon de ticket valide.",
                        ),
                    ],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Ticket pris en charge !",
                        "Vous avez pris en charge ce ticket avec succès. Il vous est désormais assigné.",
                    ),
                ],
            });

            logger.info('Ticket claimed successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: channel.id,
                channelName: channel.name,
                guildId: interaction.guildId,
                commandName: 'claim'
            });

        } catch (error) {
            logger.error('Error executing claim command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'claim'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'claim',
                source: 'ticket_claim_command'
            });
        }
    },
};
