import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, MessageFlags, ComponentType, EmbedBuilder, LabelBuilder, CheckboxBuilder, TextDisplayBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, createError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createReactionRoleMessage, hasDangerousPermissions, getAllReactionRoleMessages, deleteReactionRoleMessage } from '../../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('Gérer les configurations de rôles par réaction')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configurer un nouveau panneau de rôles par réaction')
                .addChannelOption(option => 
                    option.setName('channel')
                        .setDescription('Le salon où envoyer le message des rôles par réaction')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Titre du panneau de rôles par réaction')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Description du panneau de rôles par réaction')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role1')
                        .setDescription('Premier rôle à ajouter')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('role2')
                        .setDescription('Deuxième rôle à ajouter')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role3')
                        .setDescription('Troisième rôle à ajouter')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role4')
                        .setDescription('Quatrième rôle à ajouter')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('role5')
                        .setDescription('Cinquième rôle à ajouter')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Gérer et configurer vos panneaux de rôles par réaction')
                .addStringOption(option =>
                    option
                        .setName('panel')
                        .setDescription('Sélectionner un panneau spécifique à gérer')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'setup') {
                await handleSetup(interaction);
            } else if (subcommand === 'dashboard') {
                const selectedPanelId = interaction.options.getString('panel');
                await handleDashboard(interaction, selectedPanelId);
            }
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'reactroles',
                subcommand: subcommand
            });
        }
    },

    async autocomplete(interaction) {
        if (interaction.commandName !== 'reactroles') return;
        if (interaction.options.getSubcommand() !== 'dashboard') return;

        try {
            const guildId = interaction.guild.id;
            const client = interaction.client;
            
            let panels;
            try {
                panels = await getAllReactionRoleMessages(client, guildId);
            } catch (dbError) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            if (!panels || panels.length === 0) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const guild = interaction.guild;
            
            const validPanels = [];
            for (const panel of panels) {
                if (!panel.messageId || !panel.channelId) {
                    continue;
                }

                const channel = guild.channels.cache.get(panel.channelId);
                if (!channel) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                
                const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                if (!msg) {
                    await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
                    continue;
                }
                validPanels.push(panel);
            }

            if (validPanels.length === 0) {
                await interaction.respond([]).catch(() => {});
                return;
            }

            const choices = await Promise.all(
                validPanels.slice(0, 25).map(async panel => {
                    try {
                        const channel = guild.channels.cache.get(panel.channelId);
                        if (!channel) return null;
                        
                        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
                        if (!msg) return null;
                        
                        const title = msg?.embeds?.[0]?.title ?? 'Panneau sans titre';
                        const channelName = channel?.name ?? 'inconnu';
                        
                        return {
                            name: `${title} (#${channelName})`.substring(0, 100),
                            value: panel.messageId
                        };
                    } catch (e) {
                        return null;
                    }
                })
            );

            const validChoices = choices.filter(c => c !== null);
            await interaction.respond(validChoices).catch(() => {});
        } catch (error) {
            await interaction.respond([]).catch(() => {});
        }
    }
};

// ─── Setup Subcommand ─────────────────────────────────────────────────────────

async function handleSetup(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) return;
    
    logger.info(`Reaction role setup initiated by ${interaction.user.tag} in guild ${interaction.guild.name}`);
    
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    
    // Validate channel type
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw createError(
            `Type de salon invalide : ${channel.type}`,
            ErrorTypes.VALIDATION,
            'Veuillez sélectionner un salon textuel ou un salon d\'annonces.',
            { channelType: channel.type }
        );
    }
    
    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            'Le bot n\'a pas la permission Gérer les rôles',
            ErrorTypes.PERMISSION,
            'J\'ai besoin de la permission "Gérer les rôles" pour configurer les rôles par réaction.',
            { permission: 'ManageRoles' }
        );
    }
    
    if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        throw createError(
            `Le bot ne peut pas envoyer de messages dans ${channel.name}`,
            ErrorTypes.PERMISSION,
            `Je n'ai pas la permission d'envoyer des messages dans le salon ${channel}.`,
            { channelId: channel.id }
        );
    }

    // Check if guild has reached max of 5 panels
    const existingPanels = await getAllReactionRoleMessages(interaction.client, interaction.guildId);
    if (existingPanels && existingPanels.length >= 5) {
        throw createError(
            'Limite de panneaux atteinte',
            ErrorTypes.VALIDATION,
            'Votre serveur a atteint la limite maximale de 5 panneaux de rôles par réaction. Supprimez un panneau existant pour pouvoir en créer un nouveau.',
            { maxPanels: 5, currentPanels: existingPanels.length }
        );
    }
    
    // Collect and validate roles
    const roles = [];
    const roleValidationErrors = [];
    
    for (let i = 1; i <= 5; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (role) {
            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                roleValidationErrors.push(`**${role.name}** - Le rôle de mon bot est positionné plus bas que ce rôle dans la hiérarchie de votre serveur et ne peut donc pas l'attribuer.`);
                continue;
            }
            
            if (hasDangerousPermissions(role)) {
                roleValidationErrors.push(`**${role.name}** - Ce rôle possède des permissions dangereuses (Administrateur, Gérer le serveur, etc.)`);
                continue;
            }
            
            if (role.managed) {
                roleValidationErrors.push(`**${role.name}** - C'est un rôle géré automatiquement (intégration ou rôle de bot)`);
                continue;
            }
            
            if (role.id === interaction.guild.id) {
                roleValidationErrors.push(`**${role.name}** - Impossible d'utiliser le rôle @everyone`);
                continue;
            }
            
            roles.push(role);
        }
    }
    
    if (roleValidationErrors.length > 0) {
        const errorMsg = `Les rôles suivants ne peuvent pas être ajoutés :\n${roleValidationErrors.join('\n')}`;
        
        if (roles.length === 0) {
            throw createError(
                'Aucun rôle valide fourni',
                ErrorTypes.VALIDATION,
                errorMsg,
                { errors: roleValidationErrors }
            );
        }
        
        await interaction.followUp({
            embeds: [warningEmbed('Avertissement de validation des rôles', errorMsg)],
            ephemeral: true
        });
    }

    if (roles.length < 1) {
        throw createError(
            'Aucun rôle fourni',
            ErrorTypes.VALIDATION,
            'Vous devez fournir au sujet au moins un rôle valide.',
            {}
        );
    }

    // Create the reaction role message
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reaction_roles')
            .setPlaceholder('Sélectionnez vos rôles')
            .setMinValues(0)
            .setMaxValues(roles.length)
            .addOptions(
                roles.map(role => ({
                    label: role.name,
                    description: `Ajouter/retirer le rôle ${role.name}`,
                    value: role.id,
                    emoji: '🎭'
                }))
            )
    );

    const panelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(getColor('info'))
        .addFields({
            name: 'Rôles disponibles',
            value: roles.map(role => `• ${role}`).join('\n')
        })
        .setFooter({ text: 'Sélectionnez vos rôles dans le menu déroulant ci-dessous' });

    const message = await channel.send({
        embeds: [panelEmbed],
        components: [row]
    });

    const roleIds = roles.map(role => role.id);
    await createReactionRoleMessage(
        interaction.client,
        interaction.guildId,
        channel.id,
        message.id,
        roleIds
    );
    
    logger.info(`Reaction role message created: ${message.id} with ${roles.length} roles by ${interaction.user.tag}`);

    try {
        await logEvent({
            client: interaction.client,
            guildId: interaction.guildId,
            eventType: EVENT_TYPES.REACTION_ROLE_CREATE,
            data: {
                description: `Panneau de rôles par réaction créé par ${interaction.user.tag}`,
                userId: interaction.user.id,
                channelId: channel.id,
                fields: [
                    {
                        name: '📝 Titre',
                        value: title,
                        inline: false
                    },
                    {
                        name: '📍 Salon',
                        value: channel.toString(),
                        inline: true
                    },
                    {
                        name: '¼ Rôles',
                        value: `${roles.length} rôles`,
                        inline: true
                    },
                    {
                        name: '🏷️ Liste des rôles',
                        value: roles.map(r => r.toString()).join(', '),
                        inline: false
                    },
                    {
                        name: '🔗 Lien du message',
                        value: message.url,
                        inline: false
                    }
                ]
            }
        });
    } catch (logError) {
        logger.warn('Failed to log reaction role creation:', logError);
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Succès', `✅ Le panneau de rôles par réaction a bien été créé dans ${channel} !\n\n${message.url}`)]
    });
}

// ─── Dashboard Subcommand ─────────────────────────────────────────────────────

async function handleDashboard(interaction, selectedPanelId) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });
    if (!deferSuccess) return;

    const guildId = interaction.guild.id;
    const guild = interaction.guild;
    const client = interaction.client;

    let panels = await getAllReactionRoleMessages(client, guildId);

    if (!panels || panels.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    'Aucun panneau trouvé',
                    'Aucun panneau de rôles par réaction n\'existe actuellement. Utilisez la commande `/reactroles setup` pour en générer un.',
                ),
            ],
        });
    }

    // Filter out panels whose messages no longer exist
    const validPanels = [];
    for (const panel of panels) {
        const channel = guild.channels.cache.get(panel.channelId);
        if (!channel) {
            await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
            continue;
        }
        
        const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!msg) {
            await deleteReactionRoleMessage(client, guildId, panel.messageId).catch(() => {});
            continue;
        }
        validPanels.push(panel);
    }

    if (validPanels.length === 0) {
        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                errorEmbed(
                    'Aucun panneau valide trouvé',
                    'Aucun panneau de rôles par réaction n\'existe actuellement. Utilisez la commande `/reactroles setup` pour en générer un.',
                ),
            ],
        });
    }

    let activePanelData = null;
    if (selectedPanelId) {
        activePanelData = validPanels.find(p => p.messageId === selectedPanelId);
        if (!activePanelData) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Panneau introuvable',
                        'Ce panneau n\'existe plus ou a été supprimé.',
                    ),
                ],
            });
        }
    } else {
        activePanelData = validPanels[Math.floor(Math.random() * validPanels.length)];
    }

    const discordMsg = await fetchPanelDiscordMessage(guild, activePanelData);
    await showPanelDashboard(interaction, activePanelData, discordMsg, guildId, guild);

    let rootInteraction = interaction;
    const collector = interaction.channel.createMessageComponentCollector({
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId === `rr_opts_${guildId}`),
        time: 600_000,
    });

    const buttonCollector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i =>
            i.user.id === interaction.user.id &&
            (i.customId === `rr_edit_text_${guildId}` ||
                i.customId === `rr_delete_${guildId}`),
        time: 600_000,
    });

    collector.on('collect', async ci => {
        try {
            if (ci.customId === `rr_opts_${guildId}`) {
                const option = ci.values[0];
                switch (option) {
                    case 'add_role':
                        await handleAddRole(ci, rootInteraction, activePanelData, guildId, guild, client);
                        break;
                    case 'remove_role':
                        await handleRemoveRole(ci, rootInteraction, activePanelData, validPanels, guildId, guild, client);
                        break;
                }
            }
        } catch (error) {
            logger.error('Error in reactroles dashboard collector:', error);
            const msg =
                error instanceof TitanBotError
                    ? error.userMessage || 'Une erreur est survenue.'
                    : 'Une erreur imprévue est survenue.';
            if (!ci.replied && !ci.deferred) await ci.deferUpdate().catch(() => {});
            await ci
                .followUp({ embeds: [errorEmbed('Erreur', msg)], flags: MessageFlags.Ephemeral })
                .catch(() => {});
        }
    });

    buttonCollector.on('collect', async btnInteraction => {
        try {
            if (btnInteraction.customId === `rr_edit_text_${guildId}`) {
                await handleEditText(btnInteraction, rootInteraction, activePanelData, guildId, guild, client);
            } else if (btnInteraction.customId === `rr_delete_${guildId}`) {
                await handleDeletePanel(btnInteraction, rootInteraction, activePanelData, validPanels, guildId, guild, client, collector, buttonCollector);
            }
        } catch (error) {
            logger.error('Error in reactroles button collector:', error);
            const msg =
                error instanceof TitanBotError
                    ? error.userMessage || 'Une erreur est survenue.'
                    : 'Une erreur imprévue est survenue.';
            if (!btnInteraction.replied && !btnInteraction.deferred) await btnInteraction.deferUpdate().catch(() => {});
            await btnInteraction
                .followUp({ embeds: [errorEmbed('Erreur', msg)], flags: MessageFlags.Ephemeral })
                .catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        buttonCollector.stop();
        if (reason === 'time') {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⏱️ Session expirée')
                .setDescription('Cette session de gestion de tableau de bord a expiré pour cause d\'inactivité (10 minutes).\n\nPour continuer à modifier vos rôles par réaction, relancez la commande `/reactroles dashboard`.')
                .setColor(getColor('warning'));
            
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [timeoutEmbed],
                components: []
            }).catch(() => {});
        }
    });
}

// ─── Discord Message Helpers ──────────────────────────────────────────────────

async function fetchPanelDiscordMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return null;
        return await channel.messages.fetch(panelData.messageId).catch(() => null);
    } catch {
        return null;
    }
}

async function rebuildLivePanelMessage(guild, panelData) {
    try {
        const channel = guild.channels.cache.get(panelData.channelId);
        if (!channel) return;
        const msg = await channel.messages.fetch(panelData.messageId).catch(() => null);
        if (!msg || !msg.embeds[0]) return;

        const roleObjects = panelData.roles
            .map(id => guild.roles.cache.get(id))
            .filter(Boolean);

        if (roleObjects.length === 0) return;

        const currentEmbed = msg.embeds[0];
        const updatedEmbed = EmbedBuilder.from(currentEmbed);
        const fields = currentEmbed.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline }));
        const roleFieldIdx = fields.findIndex(f => f.name === 'Rôles disponibles');
        const newRoleValue = roleObjects.map(r => `• ${r}`).join('\n');
        if (roleFieldIdx !== -1) {
            fields[roleFieldIdx] = { name: 'Rôles disponibles', value: newRoleValue, inline: false };
        } else {
            fields.push({ name: 'Rôles disponibles', value: newRoleValue, inline: false });
        }
        updatedEmbed.setFields(fields);

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reaction_roles')
                .setPlaceholder('Sélectionnez vos rôles')
                .setMinValues(0)
                .setMaxValues(roleObjects.length)
                .addOptions(
                    roleObjects.map(r => ({
                        label: r.name.substring(0, 100),
                        description: `Ajouter/retirer le rôle ${r.name}`.substring(0, 100),
                        value: r.id,
                        emoji: '🎭',
                    })),
                ),
        );

        await msg.edit({ embeds: [updatedEmbed], components: [selectRow] });
    } catch (error) {
        logger.warn('Could not rebuild live reaction role panel:', error.message);
    }
}

// ─── View Builders ────────────────────────────────────────────────────────────

async function showPanelDashboard(interaction, panelData, discordMsg, guildId, guild) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const title = discordMsg?.embeds?.[0]?.title ?? 'Panneau sans titre';
    const roleList =
        panelData.roles.length > 0
            ? panelData.roles.map(id => `<@&${id}>`).join(', ')
            : '`Aucun`';

    const embed = new EmbedBuilder()
        .setTitle('🎭 Tableau de bord des rôles par réaction')
        .setDescription(
            `**Titre :** ${title}\n\nSélectionnez une option ci-dessous pour modifier un paramètre.${discordMsg ? `\n[👉 Cliquez ici pour voir le panneau numérique](${discordMsg.url})` : ''}`,
        )
        .setColor(getColor('info'))
        .addFields(
            { name: '📍 Salon', value: channel ? `<#${channel.id}>` : '`Introuvable`', inline: true },
            { name: '🎭 Rôles', value: `\`${panelData.roles.length} / 25\``, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '🏷️ Liste des rôles', value: roleList, inline: false },
        )
        .setFooter({ text: 'Le tableau de bord se fermera après 10 minutes d\'inactivité' })
        .setTimestamp();

    const editTextButton = new ButtonBuilder()
        .setCustomId(`rr_edit_text_${guildId}`)
        .setLabel('Modifier les textes')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✏️');

    const deleteButton = new ButtonBuilder()
        .setCustomId(`rr_delete_${guildId}`)
        .setLabel('Supprimer le panneau')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

    const optionsSelect = new StringSelectMenuBuilder()
        .setCustomId(`rr_opts_${guildId}`)
        .setPlaceholder('Sélectionner une action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Ajouter un rôle')
                .setDescription('Ajouter un rôle à ce panneau (jusqu\'à 25 au total)')
                .setValue('add_role')
                .setEmoji('➕'),
            ...(panelData.roles.length > 0 ? [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Retirer un rôle')
                    .setDescription('Retirer un rôle de ce panneau')
                    .setValue('remove_role')
                    .setEmoji('➖')
            ] : [])
        );

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(editTextButton, deleteButton),
            new ActionRowBuilder().addComponents(optionsSelect),
        ],
    });
}

// ─── Edit Panel Text ──────────────────────────────────────────────────────────

async function handleEditText(buttonInteraction, rootInteraction, panelData, guildId, guild, client) {
    const channel = guild.channels.cache.get(panelData.channelId);
    const discordMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;

    const currentTitle = discordMsg?.embeds?.[0]?.title ?? '';
    const currentDesc = discordMsg?.embeds?.[0]?.description ?? '';

    const modal = new ModalBuilder()
        .setCustomId('rr_edit_text')
        .setTitle('Modifier les textes du panneau')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_title')
                    .setLabel('Titre')
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentTitle)
                    .setMaxLength(256)
                    .setMinLength(1)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_description')
                    .setLabel('Description')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(currentDesc)
                    .setMaxLength(2048)
                    .setMinLength(1)
                    .setRequired(true),
            ),
        );

    try {
        await buttonInteraction.showModal(modal);
    } catch (error) {
        logger.error('Error showing edit text modal:', error);
        await buttonInteraction.followUp({
            embeds: [errorEmbed('Erreur', 'Impossible d\'afficher la fenêtre de modification. Veuillez réessayer.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    const submitted = await buttonInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'rr_edit_text' && i.user.id === buttonInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newTitle = submitted.fields.getTextInputValue('panel_title').trim();
    const newDesc = submitted.fields.getTextInputValue('panel_description').trim();

    if (discordMsg) {
        const updatedEmbed = EmbedBuilder.from(discordMsg.embeds[0]).setTitle(newTitle).setDescription(newDesc);
        await discordMsg.edit({ embeds: [updatedEmbed] }).catch(err => {
            logger.warn('Could not edit live panel message:', err.message);
        });
    }

    await submitted.reply({
        embeds: [successEmbed('✅ Panneau mis à jour', 'Le titre et la description ont bien été modifiés.')],
        flags: MessageFlags.Ephemeral,
    });

    const refreshedMsg = channel
        ? await channel.messages.fetch(panelData.messageId).catch(() => null)
        : null;
    await showPanelDashboard(rootInteraction, panelData, refreshedMsg, guildId, guild);
}

// ─── Add Role ─────────────────────────────────────────────────────────────────

async function handleAddRole(selectInteraction, rootInteraction, panelData, guildId, guild, client) {
    await selectInteraction.deferUpdate();

    if (panelData.roles.length >= 25) {
        await selectInteraction.followUp({
            embeds: [errorEmbed('Panneau plein', 'Ce panneau contient déjà le nombre maximum de 25 rôles.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('rr_add_role_pick')
        .setPlaceholder('Sélectionner un rôle à intégrer...')
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➕ Ajouter un rôle')
                .setDescription(
                    `**Rôles configurés :** ${panelData.roles.length}/25\n\nSélectionnez un rôle à ajouter à ce panneau d'affichage.`,
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(roleSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'rr_add_role_pick',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        if (panelData.roles.includes(role.id)) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Déjà présent', `${role} figure déjà sur ce panneau.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.id === guild.id) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Rôle invalide', 'Vous ne pouvez pas utiliser le rôle global @everyone.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.managed) {
            await roleInteraction.followUp({
                embeds: [errorEmbed('Rôle invalide', 'Les rôles gérés automatiquement par des intégrations ou bots ne peuvent être utilisés.')],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (hasDangerousPermissions(role)) {
            await roleInteraction.followUp({
                embeds: [
                    errorEmbed(
                        'Permissions sensibles détectées',
                        'Ce rôle possède des privilèges élevés (Administrateur, Gérer le serveur, etc.) et ne peut être distribué publiquement.',
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        if (role.position >= guild.members.me.roles.highest.position) {
            await roleInteraction.followUp({
                embeds: [
                    errorEmbed(
                        'Rôle trop élevé',
                        "Ce rôle est situé au-dessus du rôle le plus haut attribué à mon bot dans la hiérarchie du serveur. Déplacez mon rôle au-dessus de celui-ci dans les paramètres pour corriger cela.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        panelData.roles.push(role.id);
        const key = `reaction_roles:${guildId}:${panelData.messageId}`;
