import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Obtenir des informations détaillées sur un utilisateur")
    .addUserOption((option) =>
      option
        .setName("cible")
        .setDescription("L'utilisateur à inspecter (par défaut : vous-même)"),
    ),

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction);
      if (!deferSuccess) {
        logger.warn(`UserInfo interaction defer failed`, {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          commandName: 'userinfo'
        });
        return;
      }

      const user = interaction.options.getUser("cible") || interaction.user;
      const member = interaction.guild.members.cache.get(user.id);

      const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
      const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

      const embed = createEmbed({ title: `👤 Infos utilisateur : ${user.username}` })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "ID", value: user.id, inline: true },
          { name: "Bot", value: user.bot ? "Oui" : "Non", inline: true },
          {
            name: "Rôles",
            value:
              member && member.roles.cache.size > 1
                ? member.roles.cache
                    .map((r) => r.name)
                    .slice(0, 5)
                    .join(", ")
                : "Aucun",
            inline: true,
          },
          {
            name: "Compte créé",
            value: `<t:${createdTimestamp}:R>`,
            inline: false,
          },
          {
            name: "A rejoint le serveur",
            value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Non présent sur le serveur",
            inline: false,
          },
          {
            name: "Rôle le plus haut",
            value: member?.roles?.highest?.name || "Aucun",
            inline: true,
          },
        );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.info(`UserInfo command executed`, {
        userId: interaction.user.id,
        targetUserId: user.id,
        guildId: interaction.guildId
      });
    } catch (error) {
      logger.error(`UserInfo command execution failed`, {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      await handleInteractionError(interaction, error, {
        commandName: 'userinfo',
        source: 'userinfo_command'
      });
    }
  },
};
