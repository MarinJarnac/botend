import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("mock")
    .setDescription("cOnVeRtIt vOtRe tExTe eN mOdE sPoNgEbOb.")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Le texte à transformer.")
        .setRequired(true)
        .setMaxLength(1000),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const originalText = interaction.options.getString("text");
      
      
      if (!originalText || originalText.trim().length === 0) {
        throw new TitanBotError(
          'Empty text provided to mock command',
          ErrorTypes.USER_INPUT,
          'Veuillez fournir du texte à transformer !'
        );
      }

      
      const sanitizedText = sanitizeInput(originalText, 1000);

      let mockedText = "";
      for (let i = 0; i < sanitizedText.length; i++) {
        const char = sanitizedText[i];
        if (i % 2 === 0) {
          mockedText += char.toLowerCase();
        } else {
          mockedText += char.toUpperCase();
        }
      }

      const embed = successEmbed("mOdE sPoNgEbOb", `"${mockedText}"`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Mock command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Mock command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'mock',
        source: 'mock_command'
      });
    }
  },
};
