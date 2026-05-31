import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { 
    getJoinToCreateConfig, 
    updateJoinToCreateConfig,
    removeJoinToCreateTrigger,
    addJoinToCreateTrigger
} from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        try {
            const triggerChannel = interaction.options.getChannel('trigger_channel');
            const guildId = interaction.guild.id;

            const currentConfig = await getJoinToCreateConfig(client, guildId);

            if (!currentConfig.triggerChannels.includes(triggerChannel.id)) {
                throw new TitanBotError(
                    `Channel ${triggerChannel.id} is not a Join to Create trigger`,
                    ErrorTypes.VALIDATION,
                    `${triggerChannel} n'est pas configuré comme un salon de déclenchement Join to Create.`
                );
            }

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Configuration Join to Create')
                .setDescription(`Configurez les paramètres pour ${triggerChannel}`)
                .setColor(getColor('info'))
                .addFields(
                    {
                        name: '📝 Modèle de nom actuel',
                        value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                        inline: false
                    },
                    {
                        name: '👥 Limite d\'utilisateurs actuelle',
                        value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Aucune limite' : currentConfig.userLimit + ' utilisateurs'}`,
                        inline: true
                    },
                    {
                        name: '🎵 Bitrate actuel',
                        value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Sélectionnez une option de configuration ci-dessous' })
                .setTimestamp();

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`jointocreate_config_${triggerChannel.id}`)
                .setPlaceholder('Sélectionnez une option de configuration')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Modifier le modèle de nom')
                        .setDescription('Modifier le modèle de nom des salons temporaires')
                        .setValue('name_template'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Modifier la limite d\'utilisateurs')
                        .setDescription('Définir le maximum d\'utilisateurs par salon temporaire')
                        .setValue('user_limit'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Modifier le bitrate')
                        .setDescription('Ajuster la qualité audio des salons temporaires')
                        .setValue('bitrate'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Supprimer ce salon de déclenchement')
                        .setDescription('Retirer ce salon du système Join to Create')
                        .setValue('remove_trigger'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Voir les paramètres actuels')
                        .setDescription('Afficher les détails de la configuration actuelle')
                        .setValue('view_settings')
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            }).catch(error => {
                logger.error('Failed to edit reply in config_setup:', error);
            });

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: (i) => i.user.id === interaction.user.id && i.customId === `jointocreate_config_${triggerChannel.id}`,
                time: 60000
            });

            collector.on('collect', async (selectInteraction) => {
                await selectInteraction.deferUpdate();

                const selectedOption = selectInteraction.values[0];

                try {
                    switch (selectedOption) {
                        case 'name_template':
                            await handleNameTemplateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'user_limit':
                            await handleUserLimitChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'bitrate':
                            await handleBitrateChange(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'remove_trigger':
                            await handleRemoveTrigger(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                        case 'view_settings':
                            await handleViewSettings(selectInteraction, triggerChannel, currentConfig, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Configuration validation error: ${error.message}`, error.context || {});
                    } else {
                        logger.error('Unexpected configuration menu error:', error);
                    }
                    
                    const errorMessage = error instanceof TitanBotError 
                        ? error.userMessage || 'Une erreur est survenue lors du traitement de votre sélection.'
                        : 'Une erreur est survenue lors du traitement de votre sélection.';
                        
                    await selectInteraction.followUp({
                        embeds: [errorEmbed('Erreur de configuration', errorMessage)],
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        selectMenu.setDisabled(true)
                    );
                    
                    await InteractionHelper.safeEditReply(interaction, {
                        components: [disabledRow],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) {
                throw error;
            }
            logger.error('Unexpected error in config_setup:', error);
            throw new TitanBotError(
                `Config setup failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Impossible de configurer le système Join to Create.'
            );
        }
    }
};

async function handleNameTemplateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('📝 Configuration du modèle de nom')
        .setDescription('Veuillez entrer le nouveau modèle de nom pour le salon.')
        .addFields(
            {
                name: 'Variables disponibles',
                value: '• `{username}` - Nom d\'utilisateur\n• `{display_name}` - Nom d\'affichage\n• `{user_tag}` - Tag de l\'utilisateur (User#1234)\n• `{guild_name}` - Nom du serveur',
                inline: false
            },
            {
                name: 'Modèle actuel',
                value: `\`${currentConfig.channelOptions?.[triggerChannel.id]?.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Écrivez votre nouveau modèle dans le chat ci-dessous' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id,
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newTemplate = message.content.trim();
            
            if (!newTemplate || newTemplate.length > 100) {
                await interaction.followUp({
                    embeds: [errorEmbed('Modèle invalide', 'Le modèle doit contenir entre 1 et 100 caractères.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                nameTemplate: newTemplate
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Modèle mis à jour', `Le modèle de nom a été modifié pour : \`${newTemplate}\``)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Template validation error: ${error.message}`);
            } else {
                logger.error('Template update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Impossible de mettre à jour le modèle de nom.'
                : 'Impossible de mettre à jour le modèle de nom.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Échec de la mise à jour', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucune réponse reçue. Mise à jour du modèle annulée.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleUserLimitChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('👥 Configuration de la limite d\'utilisateurs')
        .setDescription('Veuillez entrer la nouvelle limite (0-99, où 0 = aucune limite).')
        .addFields(
            {
                name: 'Limite actuelle',
                value: `${currentConfig.channelOptions?.[triggerChannel.id]?.userLimit || currentConfig.userLimit === 0 ? 'Aucune limite' : currentConfig.userLimit + ' utilisateurs'}`,
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Écrivez la nouvelle limite dans le chat ci-dessous' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newLimit = parseInt(message.content.trim());
            
            if (newLimit < 0 || newLimit > 99) {
                await interaction.followUp({
                    embeds: [errorEmbed('Limite invalide', 'La limite d\'utilisateurs doit être comprise entre 0 et 99.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                userLimit: newLimit
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Limite mise à jour', `La limite d'utilisateurs a été modifiée pour : ${newLimit === 0 ? 'Aucune limite' : newLimit + ' utilisateurs'}`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`User limit validation error: ${error.message}`);
            } else {
                logger.error('User limit update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Impossible de mettre à jour la limite d\'utilisateurs.'
                : 'Impossible de mettre à jour la limite d\'utilisateurs.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Échec de la mise à jour', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucune réponse valide reçue. Mise à jour annulée.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleBitrateChange(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('🎵 Configuration du bitrate')
        .setDescription('Veuillez entrer le nouveau bitrate en kbps (8-384).')
        .addFields(
            {
                name: 'Bitrate actuel',
                value: `${(currentConfig.channelOptions?.[triggerChannel.id]?.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: false
            },
            {
                name: 'Valeurs courantes',
                value: '• 64 kbps - Qualité normale\n• 96 kbps - Bonne qualité\n• 128 kbps - Haute qualité\n• 256 kbps - Très haute qualité',
                inline: false
            }
        )
        .setColor(getColor('info'))
        .setFooter({ text: 'Écrivez le nouveau bitrate dans le chat ci-dessous' });

    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });

    const collector = interaction.channel.createMessageCollector({
        filter: (m) => m.author.id === interaction.user.id && /^\d+$/.test(m.content.trim()),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (message) => {
        try {
            const newBitrate = parseInt(message.content.trim());
            
            if (newBitrate < 8 || newBitrate > 384) {
                await interaction.followUp({
                    embeds: [errorEmbed('Bitrate invalide', 'Le bitrate doit être compris entre 8 et 384 kbps.')],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const channelOptions = currentConfig.channelOptions || {};
            channelOptions[triggerChannel.id] = {
                ...channelOptions[triggerChannel.id],
                bitrate: newBitrate * 1000
            };

            await updateJoinToCreateConfig(client, interaction.guild.id, {
                channelOptions: channelOptions
            });

            await interaction.followUp({
                embeds: [successEmbed('✅ Bitrate mis à jour', `Le bitrate a été modifié pour : ${newBitrate} kbps`)],
                flags: MessageFlags.Ephemeral,
            });

            await message.delete().catch(() => {});
        } catch (error) {
            if (error instanceof TitanBotError) {
                logger.debug(`Bitrate validation error: ${error.message}`);
            } else {
                logger.error('Bitrate update error:', error);
            }
            
            const errorMessage = error instanceof TitanBotError
                ? error.userMessage || 'Impossible de mettre à jour le bitrate.'
                : 'Impossible de mettre à jour le bitrate.';
                
            await interaction.followUp({
                embeds: [errorEmbed('Échec de la mise à jour', errorMessage)],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucune réponse valide reçue. Mise à jour annulée.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleRemoveTrigger(interaction, triggerChannel, currentConfig, client) {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Supprimer le salon de déclenchement')
        .setDescription(`Êtes-vous sûr de vouloir retirer ${triggerChannel} du système Join to Create ?`)
        .setColor('#ff6600')
        .setFooter({ text: 'Cette action est irréversible' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm_remove_${triggerChannel.id}`)
            .setLabel('Supprimer le salon')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`cancel_remove_${triggerChannel.id}`)
            .setLabel('Annuler')
            .setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });

    const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id && 
                      (i.customId === `confirm_remove_${triggerChannel.id}` || i.customId === `cancel_remove_${triggerChannel.id}`),
        time: 600_000,
        max: 1
    });

    collector.on('collect', async (buttonInteraction) => {
        await buttonInteraction.deferUpdate();

        if (buttonInteraction.customId === `confirm_remove_${triggerChannel.id}`) {
            try {
                const success = await removeJoinToCreateTrigger(client, interaction.guild.id, triggerChannel.id);
                
                if (success) {
                    await buttonInteraction.followUp({
                        embeds: [successEmbed('✅ Salon supprimé', `${triggerChannel} a été retiré du système Join to Create.`)],
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await buttonInteraction.followUp({
                        embeds: [errorEmbed('Échec de la suppression', 'Impossible de supprimer le salon de déclenchement.')],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } catch (error) {
                if (error instanceof TitanBotError) {
                    logger.debug(`Trigger removal validation error: ${error.message}`);
                } else {
                    logger.error('Remove trigger error:', error);
                }
                
                const errorMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Une erreur est survenue lors de la suppression du salon de déclenchement.'
                    : 'Une erreur est survenue lors de la suppression du salon de déclenchement.';
                    
                await buttonInteraction.followUp({
                    embeds: [errorEmbed('Échec de la suppression', errorMessage)],
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        } else {
            await buttonInteraction.followUp({
                embeds: [successEmbed('✅ Annulé', 'La suppression du salon a été annulée.')],
                flags: MessageFlags.Ephemeral,
            });
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            interaction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucune réponse reçue. Suppression annulée.')],
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    });
}

async function handleViewSettings(interaction, triggerChannel, currentConfig, client) {
    const channelConfig = currentConfig.channelOptions?.[triggerChannel.id] || {};
    
    const embed = new EmbedBuilder()
        .setTitle('📋 Paramètres actuels')
        .setDescription(`Configuration pour ${triggerChannel}`)
        .setColor(getColor('info'))
        .addFields(
            {
                name: '🎯 Salon de déclenchement',
                value: `${triggerChannel} (${triggerChannel.id})`,
                inline: false
            },
            {
                name: '📝 Modèle de nom du salon',
                value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate}\``,
                inline: false
            },
            {
                name: '👥 Limite d\'utilisateurs',
                value: `${channelConfig.userLimit || currentConfig.userLimit === 0 ? 'Aucune limite' : (channelConfig.userLimit || currentConfig.userLimit) + ' utilisateurs'}`,
                inline: true
            },
            {
                name: '🎵 Bitrate',
                value: `${(channelConfig.bitrate || currentConfig.bitrate) / 1000} kbps`,
                inline: true
            },
            {
                name: '📁 Catégorie',
                value: currentConfig.categoryId ? `<#${currentConfig.categoryId}>` : 'Non définie',
                inline: true
            },
            {
                name: '📊 Statut du système',
                value: currentConfig.enabled ? '✅ Activé' : '❌ Désactivé',
                inline: true
            },
            {
                name: '🔢 Salons temporaires actifs',
                value: Object.keys(currentConfig.temporaryChannels || {}).length.toString(),
                inline: true
            }
        )
        .setTimestamp();

    await interaction.followUp({ 
        embeds: [embed], 
        flags: MessageFlags.Ephemeral 
    });
}
