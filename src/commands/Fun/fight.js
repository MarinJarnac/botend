import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("Lance une simulation de combat 1v1 textuel.")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("L'adversaire à affronter.")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    try {
      await InteractionHelper.safeDefer(interaction);

      const challenger = interaction.user;
      const opponent = interaction.options.getUser("opponent");

      
      if (challenger.id === opponent.id) {
        const embed = warningEmbed(
          `**${challenger.username}**, tu ne peux pas t'affronter toi-même ! C'est un match nul avant même d'avoir commencé.`,
          "⚔️ Défi Invalide"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      
      if (opponent.bot) {
        const embed = warningEmbed(
          "Tu ne peux pas affronter de bots ! Défie plutôt une vraie personne.",
          "⚔️ Adversaire Invalide"
        );
        return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      }

      const winner = rand(0, 1) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      const rounds = rand(3, 7);
      const damage = rand(10, 50);

      const log = [];
      log.push(
        `💥 **${challenger.username}** défie **${opponent.username}** en duel ! (Au meilleur de ${rounds} manches)`,
      );

      for (let i = 1; i <= rounds; i++) {
        const attacker = rand(0, 1) === 0 ? challenger : opponent;
        const target = attacker.id === challenger.id ? opponent : challenger;
        const action = [
          "lance un coup de poing féroce",
          "inflige un coup critique",
          "utilise un sortilège mineur",
          "parre et contre-attaque",
        ][rand(0, 3)];
        log.push(
          `\n**Manche ${i} :** ${attacker.username} ${action} sur ${target.username} et inflige ${rand(1, damage)} points de dégâts !`,
        );
      }

      const outcomeText = log.join("\n");
      const winnerText = `👑 **${winner.username}** a terrassé ${loser.username} et remporte la victoire !`;
      const fullDescription = `${outcomeText}\n\n${winnerText}`;

      const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
        ? fullDescription
        : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

      const embed = successEmbed(
        description,
        "🏆 Duel Terminé !"
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
      logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
    } catch (error) {
      logger.error('Fight command error:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'fight',
        source: 'fight_command'
      });
    }
  },
};
