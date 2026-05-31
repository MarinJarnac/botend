import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const facts = [
  "Un jour sur Vénus est plus long qu'une année sur Vénus.",
  "La guerre la plus courte de l'histoire a eu lieu entre le Royaume-Uni et Zanzibar le 27 août 1896. Elle a duré entre 38 et 45 minutes.",
  "Les pieuvres ont trois cœurs et du sang bleu.",
  "Il y a plus d'arbres sur Terre que d'étoiles dans la galaxie de la Voie Lactée.",
  "On estime que le poids total de toutes les fourmis sur Terre est à peu près équivalent au poids total de tous les êtres humains.",
  "Le miel ne se périme jamais. Des archéologues ont trouvé des pots de miel vieux de 3 000 ans dans des tombes égyptiennes, et il était encore parfaitement comestible."
];

export default {
    data: new SlashCommandBuilder()
    .setName("fact")
    .setDescription("Partage un fait aléatoire et intéressant."),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      const randomFact = facts[Math.floor(Math.random() * facts.length)];

      const embed = successEmbed("🧠 Le Saviez-Vous ?", `💡 **${randomFact}**`);

      await InteractionHelper.safeReply(interaction, { embeds: [embed] });
      logger.debug(`Fact command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fact command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fact',
        source: 'fact_command'
      });
    }
  },
};
