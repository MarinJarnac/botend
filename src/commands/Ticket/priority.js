import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Définit le niveau de priorité du ticket d'assistance actuel.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Le niveau de priorité pour le ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "🔴 Urgent", value: "urgent" },
                    { name: "🟠 Haute", value: "high" },
                    { name: "🟡 Moyenne", value: "medium" },
                    { name: "🟢 Basse", value: "low" },
                    { name: "⚪ Aucune", value: "none" },
                ),
        )
        .setDMPermission(false),
    category: "Ticket",

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
                            "Vous devez disposer de la permission `Gérer les salons` ou du `Rôle Staff` configuré pour modifier la priorité du ticket.",
                        ),
                    ],
                });
            }

            const priorityLevel = interaction.options.getString("level");
            const result = await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);
            
            if (!result.success) {
                logger.warn('Priority update failed - not a valid ticket channel', {
                    userId: interaction.user.id,
                    channelId: interaction.channel.id,
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

            // Traduction rapide de la valeur pour l'embed de succès
            const priorityLabels = {
                urgent: "URGENT",
                high: "HAUTE",
                medium: "MOYENNE",
                low: "BASSE",
                none: "AUCUNE"
            };
            const displayPriority = priorityLabels[priorityLevel] || priorityLevel.toUpperCase();

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        "Priorité mise à jour",
                        `La priorité du ticket a été définie sur **${displayPriority}**.`,
                    ),
                ],
            });

            logger.info('Ticket priority updated successfully', {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                channelId: interaction.channel.id,
                channelName: interaction.channel.name,
                guildId: interaction.guildId,
                priority: priorityLevel,
                commandName: 'priority'
            });

        } catch (error) {
            logger.error('Error executing priority command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                channelId: interaction.channel?.id,
                guildId: interaction.guildId,
                commandName: 'priority'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'priority',
                source: 'ticket_priority_command'
            });
        }
    },
};
