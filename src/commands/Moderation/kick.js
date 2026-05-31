import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulser un utilisateur du serveur")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("L'utilisateur à expulser")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Raison de l'expulsion"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  category: "moderation",

  async execute(interaction, config, client) {
    try {
      
      if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        throw new TitanBotError(
          "User lacks permission",
          ErrorTypes.PERMISSION,
          "Vous n'avez pas la permission d'expulser des membres."
        );
      }

      const targetUser = interaction.options.getUser("target");
      const member = interaction.options.getMember("target");
      const reason = interaction.options.getString("reason") || "Aucune raison fournie";

      
      if (targetUser.id === interaction.user.id) {
        throw new TitanBotError(
          "Cannot kick self",
          ErrorTypes.VALIDATION,
          "Vous ne pouvez pas vous expulser vous-même."
        );
      }

      
      if (targetUser.id === client.user.id) {
        throw new TitanBotError(
          "Cannot kick bot",
          ErrorTypes.VALIDATION,
          "Vous ne pouvez pas expulser le bot."
        );
      }

      
      if (!member) {
        throw new TitanBotError(
          "Target not found",
          ErrorTypes.USER_INPUT,
          "L'utilisateur ciblé ne se trouve pas actuellement sur ce serveur.",
          { subtype: 'user_not_found' }
        );
      }

      
      if (interaction.member.roles.highest.position <= member.roles.highest.position) {
        throw new TitanBotError(
          "Cannot kick user",
          ErrorTypes.PERMISSION,
          "Vous ne pouvez pas expulser un utilisateur possédant un rôle équivalent ou supérieur au vôtre."
        );
      }

      
      if (!member.kickable) {
        throw new TitanBotError(
          "Bot cannot kick",
          ErrorTypes.PERMISSION,
          "Je ne peux pas expulser cet utilisateur. Veuillez vérifier la position de mon rôle par rapport à celle de la cible."
        );
      }

      
      await member.kick(reason);

      
      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "Member Kicked",
          target: `${targetUser.tag} (${targetUser.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          metadata: {
            userId: targetUser.id,
            moderatorId: interaction.user.id
          }
        }
      });

      
      await InteractionHelper.universalReply(interaction, {
        embeds: [
          successEmbed(
            `👢 **Expulsé** : ${targetUser.tag}`,
            `**Raison :** ${reason}\n**ID du cas :** #${caseId}`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Kick command error:', error);
      const errorEmbed_default = errorEmbed(
        "Une erreur inattendue est survenue lors de la tentative d'expulsion de l'utilisateur.",
        error.message || "Impossible d'expulser l'utilisateur"
      );
      await InteractionHelper.universalReply(interaction, { embeds: [errorEmbed_default] });
    }
  }
};
