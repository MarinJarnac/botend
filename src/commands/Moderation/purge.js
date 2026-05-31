import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { checkRateLimit } from '../../utils/rateLimiter.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Supprimer un nombre spécifique de messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Nombre de messages (1-100)")
        .setRequired(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Purge interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "Permission refusée",
            "Vous avez besoin de la permission `Gérer les messages` pour supprimer des messages.",
          ),
        ],
      });

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "Nombre invalide",
            "Veuillez spécifier un nombre entre 1 et 100.",
          ),
        ],
      });

    try {
      
      const rateLimitKey = `purge_${interaction.user.id}`;
      const isAllowed = await checkRateLimit(rateLimitKey, 5, 60000);
      if (!isAllowed) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            warningEmbed(
              "Vous supprimez des messages trop rapidement. Veuillez patienter une minute avant de réessayer.",
              "⏳ Limite de requêtes atteinte"
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      const deletedCount = deleted.size;

      const purgeEmbed = createEmbed(
        "🗑️ Messages supprimés (Log d'action)",
        `${deletedCount} messages ont été supprimés par ${interaction.user}.`,
      )
.setColor(getColor('moderation'))
        .addFields(
          { name: "Salon", value: channel.toString(), inline: true },
          {
            name: "Modérateur",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          { name: "Quantité", value: `${deletedCount} messages`, inline: false },
        );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(`🗑️ ${deletedCount} messages ont été supprimés avec succès dans ${channel}.`),
        ],
flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "Une erreur inattendue est survenue lors de la suppression des messages. Remarque : les messages datant de plus de 14 jours ne peuvent pas être supprimés en masse par un bot.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};
