import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("Crée un avis de recherche (WANTED) pour un utilisateur.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("L'utilisateur recherché.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("crime")
        .setDescription("Le crime qu'il a commis.")
        .setRequired(false)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const targetUser = interaction.options.getUser("user");
      const crimeRaw = interaction.options.getString("crime");

      
      let crime = "Beaucoup trop adorable pour ce serveur.";
      if (crimeRaw) {
        const sanitizedCrime = sanitizeInput(crimeRaw.trim(), 100);
        if (sanitizedCrime.length > 0) {
          crime = sanitizedCrime;
        }
      }

      
      if (!targetUser) {
        throw new TitanBotError(
          'Target user not found for wanted command',
          ErrorTypes.USER_INPUT,
          'Impossible de trouver l\'utilisateur spécifié.'
        );
      }

      const bountyAmount = Math.floor(
        Math.random() * (100000000 - 1000000) + 1000000,
      );
      const bounty = `$${bountyAmount.toLocaleString()} USD`;

      const embed = createEmbed({
        color: 'primary',
        title: '💥 GROSSE PRIME : RECHERCHÉ ! 💥',
        description: `**CRIMINEL :** ${targetUser.tag}\n**CRIME :** ${crime}`,
        fields: [
          {
            name: "MORT OU VIF",
            value: `**PRIME :** ${bounty}`,
            inline: false,
          },
        ],
        image: {
          url: targetUser.displayAvatarURL({ size: 1024, extension: 'png' }),
        },
        footer: {
          text: `Aperçu pour la dernière fois dans ${interaction.guild.name}`,
        },
      });

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Wanted command executed by user ${interaction.user.id} for ${targetUser.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Wanted command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'wanted',
        source: 'wanted_command'
      });
    }
  },
};
