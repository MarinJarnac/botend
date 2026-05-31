import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, LabelBuilder } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    initializeJoinToCreate,
    getChannelConfiguration,
    updateChannelConfig,
    removeTriggerChannel,
    hasManageGuildPermission,
    logConfigurationChange,
    getConfiguration
} from '../../services/joinToCreateService.js';


export default {
    data: new SlashCommandBuilder()
        .setName("jointocreate")
        .setDescription("Gérer le système de salons vocaux temporaires (Join to Create).")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Configurer un nouveau salon vocal Join to Create.")
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Catégorie dans laquelle créer le salon.")
                        .addChannelTypes(ChannelType.GuildCategory)
                )
                .addStringOption((option) =>
                    option
                        .setName("channel_name")
                        .setDescription("Sélectionner un modèle de nom pour les salons vocaux temporaires.")
                        .addChoices(
                            { name: "Salon de {username} (Par défaut)", value: "Salon de {username}" },
                            { name: "Canal de {username}", value: "Canal de {username}" },
                            { name: "Le Lounge de {username}", value: "Le Lounge de {username}" },
                            { name: "L'Espace de {username}", value: "L'Espace de {username}" },
                            { name: "Salon de {displayName}", value: "Salon de {displayName}" },
                            { name: "VC de {username}", value: "VC de {username}" },
                            { name: "🎵 Salon Musical de {username}", value: "🎵 Salon Musical de {username}" },
                            { name: "🎮 Salon Gaming de {username}", value: "🎮 Salon Gaming de {username}" },
                            { name: "💬 Salon Blabla de {username}", value: "💬 Salon Blabla de {username}" },
                            { name: "🔒 Salon Privé de {username}", value: "🔒 Salon Privé de {username}" }
                        )
                )
                .addIntegerOption((option) =>
                    option
                        .setName("user_limit")
                        .setDescription("Nombre maximum d'utilisateurs dans les salons temporaires. (0 = illimité)")
                )
                .addIntegerOption((option) =>
                    option
                        .setName("bitrate")
                        .setDescription("Bitrate des salons temporaires en kbps (8-96).")
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Configurer un système Join to Create existant.")
                .addChannelOption((option) =>
                    option
                        .setName("trigger_channel")
                        .setDescription("Le salon de déclenchement Join to Create à configurer.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildVoice)
                )
        ),
    category: "utility",

    async execute(interaction, config, client) {
        try {
            
            if (!hasManageGuildPermission(interaction.member)) {
                throw new TitanBotError(
                    'L\'utilisateur n\'a pas la permission Gérer le Serveur',
                    ErrorTypes.PERMISSION,
                    'Vous devez disposer de la permission **Gérer le Serveur** pour utiliser cette commande.'
                );
            }

            const subcommand = interaction.options.getSubcommand();
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            let responseEmbed;

            if (subcommand === "setup") {
                await handleSetupSubcommand(interaction, client);
                return;
            } else if (subcommand === "dashboard") {
                await handleConfigSubcommand(interaction, client);
                return;
            }

        } catch (error) {
            try {
                let errorMessage = 'Une erreur est survenue lors de l\'exécution de cette commande.';
                
                if (error instanceof TitanBotError) {
                    errorMessage = error.userMessage || 'Une erreur est survenue. Veuillez réessayer.';
                    logger.debug(`TitanBotError [${error.type}]: ${error.message}`, error.context || {});
                } else {
                    logger.error('Erreur inattendue dans la commande jointocreate :', error);
                    errorMessage = 'Une erreur inattendue est survenue. Veuillez réessayer ou contacter le support.';
                }

                const errorEmbedObj = errorEmbed("⚠️ Erreur", errorMessage);

                if (interaction.deferred) {
                    return await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbedObj] });
                } else {
                    return await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedObj], flags: MessageFlags.Ephemeral });
                }
            } catch (replyError) {
                logger.error('Impossible d\'envoyer le message d\'erreur :', replyError);
            }
        }
    }
};

async function handleSetupSubcommand(interaction, client) {
    try {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "Salon de {username}";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        logger.debug(`Configuration du Join to Create dans le serveur ${guildId} avec le modèle : ${nameTemplate}`);

        // Check if guild already has a Join to Create channel configured
        const existingConfig = await getConfiguration(client, guildId);
        
        if (Array.isArray(existingConfig.triggerChannels) && existingConfig.triggerChannels.length > 0) {
            const activeTriggerChannels = [];
            const staleTriggerChannelIds = [];

            for (const existingChannelId of existingConfig.triggerChannels) {
                const existingChannel = await interaction.guild.channels.fetch(existingChannelId).catch(() => null);
                if (existingChannel) {
                    activeTriggerChannels.push(existingChannel);
                } else {
                    staleTriggerChannelIds.push(existingChannelId);
                }
            }

            if (staleTriggerChannelIds.length > 0) {
                for (const staleChannelId of staleTriggerChannelIds) {
                    logger.info(`Nettoyage de l'ancien salon JTC obsolète ${staleChannelId} du serveur ${guildId}`);
                    await removeTriggerChannel(client, guildId, staleChannelId);
                }
            }

            if (activeTriggerChannels.length > 0) {
                const primaryTrigger = activeTriggerChannels[0];
                const errorMessage = `Ce serveur possède déjà un salon Join to Create configuré : ${primaryTrigger}\n\nUtilisez \`/jointocreate dashboard\` pour le modifier, ou supprimez-le avant d'en créer un nouveau.`;

                throw new TitanBotError(
                    'Le serveur a déjà un salon Join to Create',
                    ErrorTypes.VALIDATION,
                    errorMessage,
                    {
                        guildId,
                        activeTriggerCount: activeTriggerChannels.length,
                        expected: true,
                        suppressErrorLog: true
                    }
                );
            }
        }

        // Create the trigger channel
        logger.debug('Création du salon de déclenchement Join to Create...');
        let triggerChannel = await interaction.guild.channels.create({
            name: 'Join to Create',
            type: ChannelType.GuildVoice,
            parent: category?.id,
            userLimit: 0,
            bitrate: 64000,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                },
            ],
        });

        logger.debug(`Salon créé (${triggerChannel.id}), initialisation de la configuration...`);

        // Initialize the Join to Create configuration
        const config = await initializeJoinToCreate(client, guildId, triggerChannel.id, {
            nameTemplate: nameTemplate,
            userLimit: userLimit,
            bitrate: bitrate * 1000,
            categoryId: category?.id
        });

        await logConfigurationChange(client, guildId, interaction.user.id, 'Initialisation du Join to Create', {
            channelId: triggerChannel.id,
            nameTemplate,
            userLimit,
            bitrate
        });

        logger.info(`Système Join to Create créé avec succès sur le serveur ${guildId}`);

        const responseEmbed = successEmbed(
            '✅ Configuration Terminée',
            `Salon Join to Create créé avec succès : ${triggerChannel}\n\n` +
            `**Paramètres :**\n` +
            `• Modèle : \`${nameTemplate}\`\n` +
            `• Limite de places : ${userLimit === 0 ? 'Illimitée' : userLimit + ' utilisateurs'}\n` +
            `• Bitrate : ${bitrate} kbps\n` +
            `${category ? `• Catégorie : ${category.name}` : '• Catégorie : Aucune (Racine)'}`
        );

        return await InteractionHelper.safeEditReply(interaction, { embeds: [responseEmbed] });

    } catch (error) {
        logger.error('Erreur dans handleSetupSubcommand :', error);
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Échec de la configuration : ${error.message}`,
            ErrorTypes.DISCORD_API,
            'Impossible de configurer le système Join to Create. Veuillez vérifier les permissions du bot.'
        );
    }
}

async function handleConfigSubcommand(interaction, client) {
    try {
        const triggerChannel = interaction.options.getChannel('trigger_channel');
        const guildId = interaction.guild.id;

        // Validate that the channel is actually a Join to Create trigger
        const currentConfig = await getChannelConfiguration(client, guildId, triggerChannel.id);
        const channelConfig = currentConfig.channelConfig || {};

        
        const configEmbed = new EmbedBuilder()
            .setTitle('⚙️ Configuration Join to Create')
            .setDescription(`Gestion des paramètres pour ${triggerChannel}`)
            .setColor(getColor('info'))
            .addFields(
                {
                    name: '📝 Modèle de Nom du Salon',
                    value: `\`${channelConfig.nameTemplate || currentConfig.channelNameTemplate || "Salon de {username}"}\``,
                    inline: false
                },
                {
                    name: '👥 Limite d\'utilisateurs',
                    value: `${(channelConfig.userLimit ?? currentConfig.userLimit ?? 0) === 0 ? 'Illimitée' : (channelConfig.userLimit ?? currentConfig.userLimit ?? 0) + ' utilisateurs'}`,
                    inline: true
                },
                {
                    name: '🎵 Bitrate',
                    value: `${(channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000} kbps`,
                    inline: true
                }
            )
            .setFooter({ text: 'Utilisez les boutons ci-dessous pour modifier les options • Un seul salon de déclenchement est supporté par serveur' })
            .setTimestamp();

        
        const nameButton = new ButtonBuilder()
            .setCustomId(`jtc_config_name_${triggerChannel.id}`)
            .setLabel('📝 Modèle de Nom')
            .setStyle(ButtonStyle.Primary);

        const limitButton = new ButtonBuilder()
            .setCustomId(`jtc_config_limit_${triggerChannel.id}`)
            .setLabel('👥 Limite d\'utilisateurs')
            .setStyle(ButtonStyle.Primary);

        const bitrateButton = new ButtonBuilder()
            .setCustomId(`jtc_config_bitrate_${triggerChannel.id}`)
            .setLabel('🎵 Bitrate')
            .setStyle(ButtonStyle.Primary);

        const deleteButton = new ButtonBuilder()
            .setCustomId(`jtc_config_delete_${triggerChannel.id}`)
            .setLabel('🗑️ Supprimer le salon')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(nameButton, limitButton, bitrateButton, deleteButton);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [configEmbed],
            components: [row]
        });

        const message = await interaction.fetchReply();

        if (!message || typeof message.createMessageComponentCollector !== 'function') {
            throw new TitanBotError(
                'Échec de la récupération de la réponse pour la configuration du collecteur',
                ErrorTypes.DISCORD_API,
                'Impossible d\'ouvrir les commandes de configuration. Veuillez relancer la commande `/jointocreate dashboard`.'
            );
        }

        
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000
        });

        collector.on('collect', async (buttonInteraction) => {
            try {
                
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Vous devez disposer de la permission **Gérer le Serveur** pour utiliser ces commandes.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const customId = buttonInteraction.customId;

                if (customId.includes('jtc_config_name_')) {
                    await handleNameTemplateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_limit_')) {
                    await handleUserLimitModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_bitrate_')) {
                    await handleBitrateModal(buttonInteraction, triggerChannel, currentConfig, client);
                } else if (customId.includes('jtc_config_delete_')) {
                    await handleChannelDeletion(buttonInteraction, triggerChannel, currentConfig, client);
                }
            } catch (error) {
                const userMessage = error instanceof TitanBotError
                    ? error.userMessage || 'Une erreur est survenue.'
                    : 'Une erreur est survenue lors du traitement de votre demande.';

                if (error instanceof TitanBotError) {
                    logger.debug(`Erreur de validation de l'interaction bouton : ${error.message}`, error.context || {});
                } else {
                    logger.error('Erreur inattendue sur l\'interaction bouton :', error);
                }

                await buttonInteraction.reply({
                    content: `❌ ${userMessage}`,
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                nameButton.setDisabled(true),
                limitButton.setDisabled(true),
                bitrateButton.setDisabled(true),
                deleteButton.setDisabled(true)
            );

            message.edit({
                components: [disabledRow],
                embeds: [configEmbed.setFooter({ text: 'Session de configuration expirée. Relancez la commande pour appliquer de nouveaux changements.' })]
            }).catch(() => {});
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        throw new TitanBotError(
            `Échec de configuration : ${error.message}`,
            ErrorTypes.DATABASE,
            'Impossible de charger la configuration.'
        );
    }
}

async function handleNameTemplateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const TEMPLATE_OPTIONS = [
            { label: "Salon de {username} (Par défaut)", value: "Salon de {username}" },
            { label: "Canal de {username}",             value: "Canal de {username}" },
            { label: "Le Lounge de {username}",         value: "Le Lounge de {username}" },
            { label: "L'Espace de {username}",          value: "L'Espace de {username}" },
            { label: "Salon de {displayName}",          value: "Salon de {displayName}" },
            { label: "VC de {username}",                value: "VC de {username}" },
            { label: "🎵 Salon Musical de {username}",  value: "🎵 Salon Musical de {username}" },
            { label: "🎮 Salon Gaming de {username}",  value: "🎮 Salon Gaming de {username}" },
            { label: "💬 Salon Blabla de {username}",  value: "💬 Salon Blabla de {username}" },
            { label: "🔒 Salon Privé de {username}",    value: "🔒 Salon Privé de {username}" },
        ];

        const currentTemplate = currentConfig.channelConfig?.nameTemplate
            || currentConfig.channelNameTemplate
            || "Salon de {username}";

        const templateSelect = new StringSelectMenuBuilder()
            .setCustomId('template')
            .setPlaceholder('Choisissez un modèle de nom...')
            .setOptions(
                TEMPLATE_OPTIONS.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.value === currentTemplate,
                })),
            );

        const templateLabel = new LabelBuilder()
            .setLabel('Modèle de nom du salon')
            .setStringSelectMenuComponent(templateSelect);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_name_modal_${triggerChannel.id}`)
            .setTitle('Modèle de Nom du Salon')
            .addLabelComponents(templateLabel);

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_name_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ Vous devez disposer de la permission **Gérer le Serveur** pour modifier ces paramètres.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const [newTemplate] = modalSubmission.fields.getStringSelectValues('template');

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            nameTemplate: newTemplate
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Mise à jour du modèle de nom du salon', {
            channelId: triggerChannel.id,
            newTemplate
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Mis à jour', `Le modèle de nom des salons a été modifié en \`${newTemplate}\``)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Erreur inattendue dans le modal du modèle de nom :', error);
        throw new TitanBotError(
            `Erreur Modal : ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la mise à jour du modèle.'
        );
    }
}

async function handleUserLimitModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentLimit = currentConfig.channelConfig.userLimit ?? currentConfig.userLimit ?? 0;

        const modal = new ModalBuilder()
            .setCustomId(`jtc_limit_modal_${triggerChannel.id}`)
            .setTitle('Configuration de la Limite d\'utilisateurs')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('user_limit')
                        .setLabel('Indiquez la limite (0-99, 0 = illimité)')
                        .setPlaceholder('Entrez un nombre entre 0 et 99')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setValue(currentLimit.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_limit_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ Vous devez disposer de la permission **Gérer le Serveur** pour modifier ces paramètres.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('user_limit').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            userLimit: parseInt(userInput)
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Mise à jour de la limite d\'utilisateurs', {
            channelId: triggerChannel.id,
            userLimit: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Mis à jour', `La limite d'utilisateurs a été configurée sur : ${parseInt(userInput) === 0 ? 'Illimitée' : parseInt(userInput) + ' utilisateurs'}`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Erreur inattendue dans le modal de limite utilisateur :', error);
        throw new TitanBotError(
            `Erreur Modal : ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la mise à jour de la limite d\'utilisateurs.'
        );
    }
}

async function handleBitrateModal(interaction, triggerChannel, currentConfig, client) {
    try {
        const currentBitrate = ((currentConfig.channelConfig.bitrate ?? currentConfig.bitrate ?? 64000) / 1000);

        const modal = new ModalBuilder()
            .setCustomId(`jtc_bitrate_modal_${triggerChannel.id}`)
            .setTitle('Configuration du Bitrate')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('Entrez la valeur en kbps (8-384)')
                        .setPlaceholder('Entrez un nombre entre 8 et 384')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMinLength(1)
                        .setMaxLength(3)
                        .setValue(currentBitrate.toString())
                )
            );

        await interaction.showModal(modal);

        const modalSubmission = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `jtc_bitrate_modal_${triggerChannel.id}` && i.user.id === interaction.user.id,
            time: 60000
        });

        // Recheck permissions
        if (!hasManageGuildPermission(modalSubmission.member)) {
            await modalSubmission.reply({
                content: '❌ Vous devez disposer de la permission **Gérer le Serveur** pour modifier ces paramètres.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const userInput = modalSubmission.fields.getTextInputValue('bitrate').trim();

        await updateChannelConfig(client, interaction.guild.id, triggerChannel.id, {
            bitrate: parseInt(userInput) * 1000
        });

        await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Mise à jour du bitrate', {
            channelId: triggerChannel.id,
            bitrate: parseInt(userInput)
        });

        await modalSubmission.reply({
            embeds: [successEmbed('✅ Mis à jour', `Le bitrate a été configuré sur ${parseInt(userInput)} kbps`)],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
            return;
        }
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Erreur inattendue dans le modal de bitrate :', error);
        throw new TitanBotError(
            `Erreur Modal : ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la mise à jour du bitrate.'
        );
    }
}


async function handleChannelDeletion(interaction, triggerChannel, currentConfig, client) {
    try {
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`jtc_delete_confirm_${triggerChannel.id}`)
                .setLabel('🗑️ Oui, Supprimer')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`jtc_delete_cancel_${triggerChannel.id}`)
                .setLabel('❌ Annuler')
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('⚠️ Confirmer la suppression', `Êtes-vous sûr de vouloir retirer **${triggerChannel.name}** du système Join to Create ?\n\nCette action est irréversible.`)],
            components: [confirmRow],
            flags: MessageFlags.Ephemeral
        });

        const message = await interaction.fetchReply();
        const deleteCollector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && 
                          (i.customId === `jtc_delete_confirm_${triggerChannel.id}` || 
                           i.customId === `jtc_delete_cancel_${triggerChannel.id}`),
            time: 600_000,
            max: 1
        });

        deleteCollector.on('collect', async (buttonInteraction) => {
            try {
                // Recheck permissions
                if (!hasManageGuildPermission(buttonInteraction.member)) {
                    await buttonInteraction.reply({
                        content: '❌ Vous devez disposer de la permission **Gérer le Serveur** pour supprimer un salon.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (buttonInteraction.customId === `jtc_delete_confirm_${triggerChannel.id}`) {
                    
                    await removeTriggerChannel(client, interaction.guild.id, triggerChannel.id);

                    
                    await logConfigurationChange(client, interaction.guild.id, interaction.user.id, 'Suppression du déclencheur Join to Create', {
                        channelId: triggerChannel.id,
                        channelName: triggerChannel.name
                    });

                    
                    try {
                        if (triggerChannel.members.size === 0) {
                            await triggerChannel.delete('Salon de déclenchement Join to Create supprimé par un administrateur');
                        }
                    } catch (deleteError) {
                        logger.warn(`Impossible de supprimer le salon ${triggerChannel.id} : ${deleteError.message}`);
                        
                    }

                    await buttonInteraction.update({
                        embeds: [successEmbed('✅ Supprimé', `**${triggerChannel.name}** a été retiré avec succès du système Join to Create.`)],
                        components: []
                    });

                } else {
                    await buttonInteraction.update({
                        embeds: [successEmbed('✅ Annulé', 'La suppression du salon a été annulée.')],
                        components: []
                    });
                }
            } catch (collectError) {
                logger.error('Erreur lors du traitement de la confirmation de suppression :', collectError);
                await buttonInteraction.reply({
                    content: '❌ Une erreur est survenue lors du traitement de votre demande.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        });

        deleteCollector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                message.edit({ components: [] }).catch(() => {});
            }
        });

    } catch (error) {
        if (error instanceof TitanBotError) {
            throw error;
        }
        logger.error('Erreur inattendue dans handleChannelDeletion :', error);
        throw new TitanBotError(
            `Erreur de suppression : ${error.message}`,
            ErrorTypes.UNKNOWN,
            'Une erreur est survenue lors de la suppression du salon.'
        );
    }
}
