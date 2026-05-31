import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Rechercher une définition sur Urban Dictionary (Argot Anglais)')
        .addStringOption(option => 
            option.setName('terme')
                .setDescription('Le terme ou l\'expression à rechercher')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const term = interaction.options.getString('terme');
            
            // Validation de la longueur du terme avant toute action
            if (term.length < 2) {
                logger.warn('Commande Urban - terme trop court', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await interaction.reply({
                    embeds: [errorEmbed('Erreur', 'Veuillez entrer un terme d\'au moins 2 caractères.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Vérification de la configuration du serveur
            const guildConfig = await getGuildConfig(interaction.client, interaction.guild?.id);
            if (guildConfig?.disabledCommands?.includes('urban')) {
                logger.warn('Commande Urban desactivee sur ce serveur', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'urban'
                });
                return await interaction.reply({
                    embeds: [errorEmbed('Commande désactivée', 'La commande Urban Dictionary est désactivée sur ce serveur.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Gestion du Defer automatique si l'API TMDB/Urban met du temps à répondre (> 1.5s)
            let deferTimer = null;
            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHelper.safeDefer(interaction).catch((deferError) => {
                    logger.debug('Échec du fallback de defer de la commande Urban', {
                        error: deferError?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);
            
            // Requête vers l'API d'Urban Dictionary
            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            clearDeferTimer();
            
            // Si aucun résultat n'est trouvé
            if (!response.data?.list?.length) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Introuvable', `Aucune définition trouvée pour "${term}" sur Urban Dictionary.`)]
                });
            }
            
            const definition = response.data.list[0];
            
            // Nettoyage des crochets [word] utilisés par Urban Dictionary pour ses liens internes
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');
            
            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);
                
            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*Aucun exemple fourni*';
            
            // Construction de l'embed
            const embed = createEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'info'
            })
            .setURL(definition.permalink)
            .addFields(
                { 
                    name: 'Exemple', 
                    value: formattedExample,
                    inline: false 
                },
                { 
                    name: 'Stats', 
                    value: `👍 ${definition.thumbs_up.toLocaleString('fr-FR')} • 👎 ${definition.thumbs_down.toLocaleString('fr-FR')}`,
                    inline: true 
                },
                { 
                    name: 'Auteur', 
                    value: definition.author || 'Anonyme',
                    inline: true 
                }
            )
            .setFooter({ 
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png' 
            });
                
            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            
            logger.info('Définition Urban Dictionary récupérée', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });
            
        } catch (error) {
            logger.error('Erreur Urban Dictionary', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('terme'),
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'urban'
            });
            
            if (error.response?.status === 404 || !error.response) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Introuvable', `Aucune définition trouvée pour "${interaction.options.getString('terme')}" sur Urban Dictionary.`)]
                });
            } else if (error.response?.status === 429) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Limite de requêtes atteinte', 'Trop de requêtes envoyées à Urban Dictionary. Veuillez réessayer dans quelques minutes.')]
                });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};
