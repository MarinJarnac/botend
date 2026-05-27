import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Obtenir le lien vers le serveur de support"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Rejoindre le serveur de support")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "🚑 Besoin d'aide ?", description: "Rejoignez notre serveur de support officiel pour obtenir de l'aide, signaler des bugs ou suggérer des fonctionnalités. Si vous personnalisez ce bot, n'oubliez pas de modifier ce lien dans le code !" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'Erreur Système', description: 'Impossible d\'afficher les informations de support.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};
