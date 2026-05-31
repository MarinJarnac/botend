import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
function stringToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export default {
    data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Calcule le score de compatibilité amoureuse entre deux personnes.")
    .addStringOption((option) =>
      option
        .setName("name1")
        .setDescription("Le premier nom ou utilisateur.")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("name2")
        .setDescription("Le second nom ou utilisateur.")
        .setRequired(true)
        .setMaxLength(100),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const name1Raw = interaction.options.getString("name1");
      const name2Raw = interaction.options.getString("name2");

      
      if (!name1Raw || name1Raw.trim().length === 0 || !name2Raw || name2Raw.trim().length === 0) {
        throw new TitanBotError(
          'Empty names provided to ship command',
          ErrorTypes.USER_INPUT,
          'Veuillez fournir des noms valides pour les deux personnes !'
        );
      }

      
      const name1 = sanitizeInput(name1Raw.trim(), 100);
      const name2 = sanitizeInput(name2Raw.trim(), 100);

      
      if (name1.toLowerCase() === name2.toLowerCase()) {
        const embed = warningEmbed(
          `**${name1}** ne peut pas former un couple avec soi-même ! Veuillez choisir deux personnes différentes.`,
          "💖 Score de Compatibilité"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const sortedNames = [name1, name2].sort();
      const combination = sortedNames.join("-").toLowerCase();
      const score = stringToHash(combination) % 101;

      let description;
      if (score === 100) {
        description = "Âmes sœurs ! C'est le destin, ils sont faits l'un pour l'autre !";
      } else if (score >= 80) {
        description = "Le couple parfait ! Préparez la pièce montée et les alliances !";
      } else if (score >= 60) {
        description = "Une très bonne alchimie. Ça vaut vraiment le coup d'essayer !";
      } else if (score >= 40) {
        description = "Juste bons amis. Peut-être qu'avec le temps... ?";
      } else if (score >= 20) {
        description = "C'est compliqué. Ils feraient mieux de garder leurs distances.";
      } else {
        description = "Compatibilité zéro. Fuyez le plus loin possible !";
      }

      const progressBar =
        "█".repeat(Math.floor(score / 10)) +
        "░".repeat(10 - Math.floor(score / 10));

      const embed = successEmbed(
        `💖 Score de Compatibilité : ${name1} vs ${name2}`,
        `Compatibilité : **${score}%**\n\n\`${progressBar}\`\n\n*${description}*`,
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Ship command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Ship command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'ship',
        source: 'ship_command'
      });
    }
  },
};
