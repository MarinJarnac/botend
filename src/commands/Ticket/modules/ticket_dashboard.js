import { getColor } from '../../../config/bot.js';
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getGuildConfig } from '../../../services/guildConfig.js';
import { getGuildConfigKey } from '../../../utils/database.js';

// ─── Embed & Menu Builders ────────────────────────────────────────────────────

function buildDashboardEmbed(config, guild) {
    const panelChannel = config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : '`Non défini`';
    const staffRole = config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : '`Non défini`';
    const ticketLogsChannel = config.ticketLogsChannelId ? `<#${config.ticketLogsChannelId}>` : '`Non défini`';
    const transcriptChannel = config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : '`Non défini`';
    
    // Récupération des catégories depuis le cache du serveur
    const openCategoryChannel = config.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;
    const openCategory = openCategoryChannel ? openCategoryChannel.toString() : '`Non défini`';
    
    const closedCategoryChannel = config.ticketClosedCategoryId ? guild.channels.cache.get(config.ticketClosedCategoryId) : null;
    const closedCategory = closedCategoryChannel ? closedCategoryChannel.toString() : '`Non défini`';

    const rawMsg = config.ticketPanelMessage || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.';
    const panelMsg = `\`${rawMsg.length > 60 ? rawMsg.substring(0, 60) + '…' : rawMsg}\``;
    const btnLabel = `\`${config.ticketButtonLabel || 'Ouvrir un ticket'}\``;

    return new EmbedBuilder()
        .setTitle('🎫 Tableau de bord du Système de Tickets')
        .setDescription(`Gérez la configuration des tickets pour **${guild.name}**.\nSélectionnez une option ci-dessous pour modifier un paramètre.`)
        .setColor(getColor('info'))
        .addFields(
            { name: '📢 Salon du Panel', value: panelChannel, inline: true },
            { name: '🛡️ Rôle Staff', value: staffRole, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '📁 Catégorie Tickets Ouverts', value: openCategory, inline: true },
            { name: '📂 Catégorie Tickets Fermés', value: closedCategory, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '📝 Message du Panel', value: panelMsg, inline: false },
            { name: '🏷️ Texte du Bouton', value: btnLabel, inline: true },
            { name: '🔢 Tickets Max / Utilisateur', value: String(config.maxTicketsPerUser || 3), inline: true },
            { name: '📬 MP à la Fermeture', value: config.dmOnClose !== false ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '🎫 Salon des Logs de Tickets', value: ticketLogsChannel, inline: true },
            { name: '📜 Salon des Transcripts', value: transcriptChannel, inline: true },
        )
        .setFooter({ text: 'Sélectionnez une option • Fermeture automatique après 10 minutes d\'inactivité' })
        .setTimestamp();
}

function buildSelectMenu(guildId) {
    return new StringSelectMenuBuilder()
        .setCustomId(`ticket_config_${guildId}`)
        .setPlaceholder('Sélectionnez un paramètre à configurer...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le message du panel')
                .setDescription('Changer le texte affiché sur le panel de création de ticket')
                .setValue('panel_message')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le texte du bouton')
                .setDescription('Changer le libellé du bouton de création de ticket')
                .setValue('button_label')
                .setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Changer la catégorie des tickets ouverts')
                .setDescription('Catégorie où les nouveaux tickets seront créés')
                .setValue('open_category')
                .setEmoji('📁'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Changer la catégorie des tickets fermés')
                .setDescription('Catégorie où les tickets fermés seront déplacés')
                .setValue('closed_category')
                .setEmoji('📂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la limite de tickets par utilisateur')
                .setDescription('Limiter le nombre de tickets ouverts simultanés pour un membre')
                .setValue('max_tickets')
                .setEmoji('🔢'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir le salon des logs')
                .setDescription('Salon recevant les avis, cycles de vie et logs des tickets')
                .setValue('logs_channel')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir le salon des transcripts')
                .setDescription('Salon où sont envoyés les historiques textuels lors de la suppression')
                .setValue('transcript_channel')
                .setEmoji('📜'),
        );
}

function buildButtonRow(guildConfig, guildId, disabled = false) {
    const dmEnabled = guildConfig.dmOnClose !== false;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_dm_toggle_${guildId}`)
            .setLabel('MP à la fermeture')
            .setStyle(dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
            .setEmoji(dmEnabled ? '📬' : '📭')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_staff_role_btn_${guildId}`)
            .setLabel('Rôle Staff')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛡️')
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`ticket_cfg_delete_${guildId}`)
            .setLabel('Supprimer le système')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(disabled),
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function refreshDashboard(rootInteraction, guildConfig, guildId) {
    const buttonRow = buildButtonRow(guildConfig, guildId);
    const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(guildId));
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [buildDashboardEmbed(guildConfig, rootInteraction.guild)],
        components: [buttonRow, selectRow],
    }).catch(() => {});
}

async function updateLivePanel(client, guild, config) {
    if (!config.ticketPanelChannelId) return false;
    try {
        const channel = await guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
        if (!channel) return false;

        const messages = await channel.messages.fetch({ limit: 50 });
        const panelMsg = messages.find(
            m =>
                m.author.id === client.user.id &&
                m.components?.length > 0 &&
                m.components[0]?.components?.[0]?.customId === 'create_ticket',
        );
        if (!panelMsg) return false;

        const updatedEmbed = new EmbedBuilder()
            .setTitle('🎫 Support Technique')
            .setDescription(config.ticketPanelMessage || 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.')
            .setColor(getColor('info'));

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel(config.ticketButtonLabel || 'Ouvrir un ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📩'),
        );

        await panelMsg.edit({ embeds: [updatedEmbed], components: [button] });
        return true;
    } catch (error) {
        logger.warn('Failed to update live ticket panel:', error.message);
        return false;
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default {
    async execute(interaction, config, client) {
        try {
            const guildId = interaction.guild.id;
            const guildConfig = await getGuildConfig(client, guildId);

            if (!guildConfig.ticketPanelChannelId) {
                throw new TitanBotError(
                    'Ticket system not configured',
                    ErrorTypes.CONFIGURATION,
                    'Le système de tickets n\'a pas encore été configuré. Exécutez d\'abord la commande `/ticket setup`.',
                );
            }

            const selectMenu = buildSelectMenu(guildId);
            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            const buttonRow = buildButtonRow(guildConfig, guildId);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [buildDashboardEmbed(guildConfig, interaction.guild)],
                components: [buttonRow, selectRow],
            });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            const replyMessageId = replyMessage?.id;

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    i.customId === `ticket_config_${guildId}` &&
                    (!replyMessageId || i.message.id === replyMessageId),
                time: 600_000,
            });

            const buttonCollector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id &&
                    (!replyMessageId || i.message.id === replyMessageId) &&
                    (i.customId === `ticket_cfg_dm_toggle_${guildId}` ||
                        i.customId === `ticket_cfg_staff_role_btn_${guildId}` ||
                        i.customId === `ticket_cfg_delete_${guildId}`),
                time: 600_000,
            });

            collector.on('collect', async (selectInteraction) => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'panel_message':
                            await handlePanelMessage(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'button_label':
                            await handleButtonLabel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'open_category':
                            await handleOpenCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'closed_category':
                            await handleClosedCategory(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'max_tickets':
                            await handleMaxTickets(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'logs_channel':
                            await handleLogsChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                        case 'transcript_channel':
                            await handleTranscriptChannel(selectInteraction, interaction, guildConfig, guildId, client);
                            break;
                    }
                } catch (error) {
                    if (error instanceof TitanBotError) {
                        logger.debug(`Ticket config validation error: ${error.message}`);
                    } else {
                        logger.error('Unexpected ticket config menu error:', error);
                    }

                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'Une erreur est survenue lors du traitement de votre sélection.'
                            : 'Une erreur inattendue est survenue lors de la mise à jour de la configuration.';

                    await selectInteraction
                        .followUp({
                            embeds: [errorEmbed('Erreur de Configuration', errorMessage)],
                            flags: MessageFlags.Ephemeral,
                        })
                        .catch(() => {});
                }
            });

            buttonCollector.on('collect', async (btnInteraction) => {
                try {
                    if (btnInteraction.customId === `ticket_cfg_dm_toggle_${guildId}`) {
                        await handleDmOnClose(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_staff_role_btn_${guildId}`) {
                        await handleStaffRole(btnInteraction, interaction, guildConfig, guildId, client);
                    } else if (btnInteraction.customId === `ticket_cfg_delete_${guildId}`) {
                        await handleDeleteSystem(btnInteraction, interaction, guildConfig, guildId, client);
                    }
                } catch (error) {
                    if (error.code === 40060) return;
                    if (error instanceof TitanBotError) {
                        logger.debug(`Ticket config button error: ${error.message}`);
                    } else {
                        logger.error('Unexpected ticket config button error:', error);
                    }
                    const errorMessage =
                        error instanceof TitanBotError
                            ? error.userMessage || 'Une erreur est survenue lors du traitement de votre sélection.'
                            : 'Une erreur inattendue est survenue lors de la mise à jour de la configuration.';
                    
                    await btnInteraction
                        .followUp({
                            embeds: [errorEmbed('Erreur de Configuration', errorMessage)],
                            flags: MessageFlags.Ephemeral,
                        })
                        .catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                buttonCollector.stop();
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ Tableau de bord expiré')
                        .setDescription('Ce tableau de bord a été fermé pour cause d\'inactivité. Veuillez relancer la commande pour continuer.')
                        .setColor(getColor('error'));
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [timeoutEmbed],
                        components: [],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Unexpected error in ticket_config:', error);
            throw new TitanBotError(
                `Ticket config failed: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'Impossible d\'ouvrir le tableau de bord de configuration des tickets.',
            );
        }
    },
};

// ─── Panel Message ────────────────────────────────────────────────────────────

async function handlePanelMessage(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_panel_msg')
        .setTitle('Modifier le message du panel')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('panel_msg_input')
                    .setLabel('Message du panel')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(
                        guildConfig.ticketPanelMessage ||
                            'Cliquez sur le bouton ci-dessous pour ouvrir un ticket de support.',
                    )
                    .setMaxLength(2000)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Ex: Cliquez ici pour contacter le staff.'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_panel_msg' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newMessage = submitted.fields.getTextInputValue('panel_msg_input').trim();
    guildConfig.ticketPanelMessage = newMessage;
    await client.db.set(getGuildConfigKey(guildId), guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Message du panel mis à jour',
                `Le message du panel a été modifié avec succès.${
                    panelUpdated
                        ? '\nLe panel en direct a également été rafraîchi.'
                        : '\n> **Note :** Le panel actif n\'a pas pu être trouvé. Le nouveau message s\'appliquera lors de votre prochain `/ticket setup`.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId);
}

// ─── Button Label ─────────────────────────────────────────────────────────────

async function handleButtonLabel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_btn_label')
        .setTitle('Modifier le texte du bouton')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('btn_label_input')
                    .setLabel('Texte du bouton (max 80 caractères)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(guildConfig.ticketButtonLabel || 'Ouvrir un ticket')
                    .setMaxLength(80)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('Ouvrir un ticket'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_btn_label' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newLabel = submitted.fields.getTextInputValue('btn_label_input').trim();
    guildConfig.ticketButtonLabel = newLabel;
    await client.db.set(getGuildConfigKey(guildId), guildConfig);

    const panelUpdated = await updateLivePanel(client, rootInteraction.guild, guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Texte du bouton mis à jour',
                `Le libellé du bouton a été changé en : \`${newLabel}\`.${
                    panelUpdated
                        ? '\nLe bouton du panel actif a également été mis à jour.'
                        : '\n> **Note :** Le panel actif n\'a pas pu être trouvé. Ce libellé s\'appliquera lors de votre prochain `/ticket setup`.'
                }`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId);
}

// ─── Staff Role ───────────────────────────────────────────────────────────────

async function handleStaffRole(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('ticket_cfg_staff_role')
        .setPlaceholder('Sélectionnez le rôle Staff...')
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(roleSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🛡️ Modifier le rôle Staff')
                .setDescription(
                    `**Actuel :** ${guildConfig.ticketStaffRoleId ? `<@&${guildConfig.ticketStaffRoleId}>` : '`Non défini`'}\n\nSélectionnez le rôle qui recevra les permissions d'administration pour gérer les tickets.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const roleCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.RoleSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_staff_role',
        time: 60_000,
        max: 1,
    });

    roleCollector.on('collect', async roleInteraction => {
        await roleInteraction.deferUpdate();
        const role = roleInteraction.roles.first();

        guildConfig.ticketStaffRoleId = role.id;
        await client.db.set(getGuildConfigKey(guildId), guildConfig);

        await roleInteraction.followUp({
            embeds: [successEmbed('✅ Rôle Staff mis à jour', `Le rôle Staff a été défini sur ${role}.`)],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId);
    });

    roleCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [errorEmbed('Délai dépassé', 'Aucun rôle n\'a été sélectionné. Le rôle Staff reste inchangé.')],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Open Tickets Category ────────────────────────────────────────────────────

async function handleOpenCategory(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_open_cat')
        .setPlaceholder('Sélectionnez une catégorie...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📁 Catégorie des tickets ouverts')
                .setDescription(
                    `**Actuelle :** ${guildConfig.ticketCategoryId ? `<#${guildConfig.ticketCategoryId}>` : '`Non définie`'}\n\nChoisissez la catégorie dans laquelle les nouveaux salons de tickets seront créés.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_open_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first();

        guildConfig.ticketCategoryId = category.id;
        await client.db.set(getGuildConfigKey(guildId), guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    '✅ Catégorie Ouverte mise à jour',
                    `Les nouveaux tickets seront désormais créés dans la catégorie **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [
                        errorEmbed('Délai dépassé', 'Aucune catégorie n\'a été sélectionnée. Le paramètre reste inchangé.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Closed Tickets Category ──────────────────────────────────────────────────

async function handleClosedCategory(
    selectInteraction,
    rootInteraction,
    guildConfig,
    guildId,
    client,
) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_closed_cat')
        .setPlaceholder('Sélectionnez une catégorie...')
        .addChannelTypes(ChannelType.GuildCategory)
        .setMaxValues(1);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📂 Catégorie des tickets fermés')
                .setDescription(
                    `**Actuelle :** ${guildConfig.ticketClosedCategoryId ? `<#${guildConfig.ticketClosedCategoryId}>` : '`Non définie`'}\n\nChoisissez la catégorie vers laquelle les tickets seront déplacés une fois fermés.`,
                )
                .setColor(getColor('info')),
        ],
        components: [row],
        flags: MessageFlags.Ephemeral,
    });

    const catCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_closed_cat',
        time: 60_000,
        max: 1,
    });

    catCollector.on('collect', async catInteraction => {
        await catInteraction.deferUpdate();
        const category = catInteraction.channels.first();

        guildConfig.ticketClosedCategoryId = category.id;
        await client.db.set(getGuildConfigKey(guildId), guildConfig);

        await catInteraction.followUp({
            embeds: [
                successEmbed(
                    '✅ Catégorie Fermée mise à jour',
                    `Les tickets fermés seront désormais déplacés dans la catégorie **${category.name}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId);
    });

    catCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction
                .followUp({
                    embeds: [
                        errorEmbed('Délai dépassé', 'Aucune catégorie n\'a été sélectionnée. Le paramètre reste inchangé.'),
                    ],
                    flags: MessageFlags.Ephemeral,
                })
                .catch(() => {});
        }
    });
}

// ─── Max Tickets per User ─────────────────────────────────────────────────────

async function handleMaxTickets(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    const modal = new ModalBuilder()
        .setCustomId('ticket_cfg_max_tickets')
        .setTitle('Tickets max par utilisateur')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('max_tickets_input')
                    .setLabel('Limite max de tickets ouverts (1–10)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(guildConfig.maxTicketsPerUser || 3))
                    .setMaxLength(2)
                    .setMinLength(1)
                    .setRequired(true)
                    .setPlaceholder('3'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i =>
                i.customId === 'ticket_cfg_max_tickets' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const raw = submitted.fields.getTextInputValue('max_tickets_input').trim();
    const newMax = parseInt(raw, 10);

    if (isNaN(newMax) || newMax < 1 || newMax > 10) {
        await submitted.reply({
            embeds: [errorEmbed('Valeur invalide', 'La limite doit être un nombre entier compris entre **1** et **10**.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    guildConfig.maxTicketsPerUser = newMax;
    await client.db.set(getGuildConfigKey(guildId), guildConfig);

    await submitted.reply({
        embeds: [
            successEmbed(
                '✅ Nombre maximal mis à jour',
                `Les utilisateurs peuvent désormais avoir un maximum de **${newMax}** ticket${newMax !== 1 ? 's' : ''} ouvert${newMax !== 1 ? 's' : ''} simultanément.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId);
}

// ─── DM on Close Toggle ───────────────────────────────────────────────────────

async function handleDmOnClose(btnInteraction, rootInteraction, guildConfig, guildId, client) {
    await btnInteraction.deferUpdate();

    const newState = guildConfig.dmOnClose === false;
    guildConfig.dmOnClose = newState;
    await client.db.set(getGuildConfigKey(guildId), guildConfig);

    await btnInteraction.followUp({
        embeds: [
            successEmbed(
                '✅ Notification MP mise à jour',
                `Les utilisateurs **${newState ? 'recevront désormais' : 'ne recevront plus'}** de message privé à la fermeture de leur ticket.`,
            ),
        ],
        flags: MessageFlags.Ephemeral,
    });

    await refreshDashboard(rootInteraction, guildConfig, guildId);
}

// ─── Feedback Logs Channel ────────────────────────────────────────────────────

async function handleLogsChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_logs_channel')
        .setPlaceholder('Sélectionnez un salon textuel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎫 Salon des logs de tickets')
                .setDescription('Choisissez le salon où seront envoyés les suivis de satisfaction, ainsi que les événements système (ouverture, fermeture, prise en charge, etc.).')
                .setColor(getColor('info'))
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_logs_channel',
        time: 60_000,
        max: 1
    });

    collector.on('collect', async (channelInteraction) => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first();

        guildConfig.ticketLogsChannelId = channel.id;
        await client.db.set(getGuildConfigKey(guildId), guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('✅ Salon des logs mis à jour', `Les logs de tickets seront maintenant envoyés dans <#${channel.id}>.`)],
            flags: MessageFlags.Ephemeral
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucun salon n\'a été sélectionné. Le paramètre reste inchangé.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    });
}

// ─── Transcript Channel ───────────────────────────────────────────────────────

async function handleTranscriptChannel(selectInteraction, rootInteraction, guildConfig, guildId, client) {
    await selectInteraction.deferUpdate();

    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('ticket_cfg_transcript_channel')
        .setPlaceholder('Sélectionnez un salon textuel...')
        .addChannelTypes(ChannelType.GuildText)
        .setMaxValues(1);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📜 Salon des transcripts')
                .setDescription('Choisissez le salon dans lequel l\'historique des messages du ticket (transcript) sera archivé automatiquement lors de la suppression définitive du salon.')
                .setColor(getColor('info'))
        ],
        components: [new ActionRowBuilder().addComponents(channelSelect)],
        flags: MessageFlags.Ephemeral
    });

    const collector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i => i.user.id === selectInteraction.user.id && i.customId === 'ticket_cfg_transcript_channel',
        time: 60_000,
        max: 1
    });

    collector.on('collect', async (channelInteraction) => {
        await channelInteraction.deferUpdate();
        const channel = channelInteraction.channels.first();

        guildConfig.ticketTranscriptChannelId = channel.id;
        await client.db.set(getGuildConfigKey(guildId), guildConfig);

        await channelInteraction.followUp({
            embeds: [successEmbed('✅ Salon des transcripts mis à jour', `Les archives HTML/texte des tickets supprimés seront envoyées dans <#${channel.id}>.`)],
            flags: MessageFlags.Ephemeral
        });

        await refreshDashboard(rootInteraction, guildConfig, guildId);
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            selectInteraction.followUp({
                embeds: [errorEmbed('Délai dépassé', 'Aucun salon n\'a été sélectionné. Le paramètre reste inchangé.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    });
}
