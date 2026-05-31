import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('google')
        .setDescription('Générer un lien de recherche Google')
        .addStringOption(option => 
            option.setName('recherche')
                .setDescription('Que souhaitez-vous chercher ?')
                .setRequired(true)),
                
    async execute(interaction) {
        try {
            const query = interaction.options.getString('recherche');
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            
            const embed = createEmbed({
                title: 'Recherche Google',
                description: `[Résultats de recherche pour "${query}"](${searchUrl})`,
                color: 'info'
            })
            .setFooter({ text: 'Lien de recherche Google' });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            
            logger.info('Lien de recherche Google généré', {
                userId: interaction.user.id,
                query: query,
                guildId: interaction.guildId,
                commandName: 'google'
            });
        } catch (error) {
            logger.error('Erreur dans la commande google', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'google'
            });
            
            await handleInteractionError(interaction, error, {
                commandName: 'google',
                source: 'google_search'
            });
        }
    },
};
