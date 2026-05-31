import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('definir')
        .setDescription('Chercher la définition d\'un mot anglais')
        .addStringOption(option => 
            option.setName('mot')
                .setDescription('Le mot à chercher')
                .setRequired(true)),
                
    async execute(interaction) {
        const word = interaction.options.getString('mot');
        
        // Validation de la longueur avant le defer pour permettre une réponse éphémère fonctionnelle
        if (word.length < 2) {
            logger.warn('Commande definir - mot trop court', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId
            });
            return await interaction.reply({
                embeds: [errorEmbed('Erreur', 'Veuillez entrer un mot d\'au moins 2 caractères.')],
                flags: MessageFlags.Ephemeral
            });
        }

        // Différer la réponse car l'appel API peut prendre du temps
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            // Appel à l'API (Free Dictionary API ne gère que l'anglais)
            const response = await axios.get(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { 
                    timeout: 5000,
                    validateStatus: (status) => status === 200 || status === 404
                }
            );

            // Si le mot n'est pas trouvé (404)
            if (response.status === 404 || !response.data || response.data.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Introuvable', `Aucune définition trouvée pour "${word}".`)]
                });
            }

            const data = response.data[0];
            const embed = createEmbed({
                title: data.word,
                description: data.phonetic ? `*${data.phonetic}*` : '',
                color: 'success'
            });

            // Récupération des définitions (max 5 natures de mot, 3 définitions par nature)
            data.meanings.slice(0, 5).forEach(meaning => {
                const definitions = meaning.definitions
                    .slice(0, 3)
                    .map((def, idx) => {
                        let text = `${idx + 1}. ${def.definition}`;
                        if (def.example) {
                            text += `\n   *Exemple : ${def.example}*`;
                        }
                        return text;
                    })
                    .join('\n\n');

                if (definitions) {
                    embed.addFields({
                        name: `**${meaning.partOfSpeech || 'Définition'}**`,
                        value: definitions,
                        inline: false
                    });
                }
            });

            embed.setFooter({ text: 'Propulsé par Free Dictionary API' });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

            logger.info('Définition dictionnaire récupérée', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'definir'
            });

        } catch (error) {
            // Seules les vraies erreurs réseau ou timeouts tombent ici désormais
            logger.error('Erreur de recherche dictionnaire', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'definir'
            });

            await handleInteractionError(interaction, error, {
                commandName: 'definir',
                source: 'dictionary_api'
            });
        }
    },
};
