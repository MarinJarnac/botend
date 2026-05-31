import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000; // 15 minutes

const COLOR_PRESETS = [
    { label: 'Primaire (Bleu)',      value: '#336699', emoji: '🔵' },
    { label: 'Succès (Vert)',        value: '#57F287', emoji: '🟢' },
    { label: 'Erreur (Rouge)',       value: '#ED4245', emoji: '🔴' },
    { label: 'Attention (Jaune)',    value: '#FEE75C', emoji: '🟡' },
    { label: 'Info (Bleu clair)',    value: '#3498DB', emoji: '💙' },
    { label: 'Blurple (Discord)',    value: '#5865F2', emoji: '🟣' },
    { label: 'Fuchsia',              value: '#EB459E', emoji: '💜' },
    { label: 'Or',                   value: '#F1C40F', emoji: '🟠' },
    { label: 'Blanc',                value: '#FFFFFF', emoji: '⚪' },
    { label: 'Sombre',               value: '#202225', emoji: '⚫' },
    { label: 'Hexadécimal perso...', value: '__custom__', emoji: '🎨' },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

// ─── Constructeurs d'Embeds ────────────────────────────────────────────────────

/**
 * Génère l'embed d'aperçu en direct selon l'état actuel.
 */
function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title)       embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    try {
        embed.setColor(state.color || getColor('primary'));
    } catch {
        embed.setColor(getColor('primary'));
    }

    if (state.author?.name) {
        const obj = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url   && isValidUrl(state.author.url))      obj.url     = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image     && isValidUrl(state.image))     embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    // Assure un rendu visuel même si l'embed est totalement vide
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(Vide — Utilisez le menu ci-dessous pour ajouter du contenu)*');
    }

    return embed;
}

/**
 * Génère le panneau de contrôle / tableau de bord (affiché sous l'aperçu).
 */
function buildDashboardEmbed(state) {
    const trunc = (str, n) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**Titre** › ${state.title ? `\`${trunc(state.title, 40)}\`` : '`Non défini`'}`,
        `**Description** › ${state.description ? `${state.description.length} caractère(s)` : '`Non définie`'}`,
        `**Couleur** › ${state.color ? `\`${state.color}\`` : '`Par défaut`'}`,
        `**Auteur** › ${state.author?.name ? `\`${trunc(state.author.name, 30)}\`` : '`Non défini`'}`,
        `**Pied de page (Footer)** › ${state.footer?.text ? `\`${trunc(state.footer.text, 30)}\`` : '`Non défini`'}`,
        `**Miniature (Thumbnail)** › ${state.thumbnail ? '✅ Définie' : '`Non définie`'}`,
        `**Image de bannière** › ${state.image ? '✅ Définie' : '`Non définie`'}`,
        `**Horodatage (Timestamp)** › ${state.timestamp ? '✅ Activé' : '`Désactivé`'}`,
        `**Champs (Fields)** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('🛠️ Éditeur d\'Embed — Panneau de Configuration')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({ text: 'L\'aperçu ci-dessus s\'actualise en direct · Fermeture après 15 min d\'inactivité' });
}

/**
 * Génère le menu de sélection principal.
 */
function buildMainMenu(state) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('eb_menu')
        .setPlaceholder('Choisissez une action...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier le contenu')
                .setDescription('Définir le titre et la description principale')
                .setValue('edit_content')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Changer la couleur')
                .setDescription('Choisir un préréglage ou entrer un code Hex')
                .setValue('set_color')
                .setEmoji('🎨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir l\'auteur')
                .setDescription('Configurer le bloc d\'auteur tout en haut')
                .setValue('set_author')
                .setEmoji('👤'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir le pied de page')
                .setDescription('Configurer le texte et l\'icône de bas de page')
                .setValue('set_footer')
                .setEmoji('📄'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Gérer les images')
                .setDescription('Ajouter ou retirer la miniature ou la bannière')
                .setValue('set_images')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(`Ajouter un champ (${state.fields.length}/${MAX_FIELDS})`)
                .setDescription('Ajouter un nouveau champ en ligne ou en bloc')
                .setValue('add_field')
                .setEmoji('➕'),
        );

    if (state.fields.length > 0) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Modifier un champ')
                .setDescription('Changer le nom, la valeur ou la disposition d\'un champ')
                .setValue('edit_field')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Supprimer un champ')
                .setDescription('Retirer définitivement un champ de l\'embed')
                .setValue('remove_field')
                .setEmoji('➖'),
        );

        if (state.fields.length >= 2) {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Réordonner les champs')
                    .setDescription('Déplacer un champ vers le haut ou vers le bas')
                    .setValue('reorder_fields')
                    .setEmoji('↕️'),
            );
        }
    }

    select.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel(state.timestamp ? 'Désactiver l\'horodatage' : 'Activer l\'horodatage')
            .setDescription('Afficher ou masquer la date/heure actuelle en bas')
            .setValue('toggle_timestamp')
            .setEmoji('🕐'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Envoyer l\'embed')
            .setDescription('Publier l\'embed finalisé dans un salon')
            .setValue('post_embed')
            .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Données brutes / JSON')
            .setDescription('Afficher la structure JSON brute de cet embed')
            .setValue('json_export')
            .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
            .setLabel('Tout réinitialiser')
            .setDescription('Effacer l\'intégralité des champs pour recommencer')
            .setValue('reset_all')
            .setEmoji('🗑️'),
    );

    return select;
}

/**
 * Actualise le message du panneau avec le nouvel état.
 */
async function refreshDashboard(interaction, state) {
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: [new ActionRowBuilder().addComponents(buildMainMenu(state))],
    });
}

// ─── Gestionnaires d'Options ──────────────────────────────────────────────────

async function handleEditContent(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Modifier le contenu')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Titre (max 256 caractères)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Le titre de mon embed'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Description (max 4000 caractères)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('Rédigez le contenu principal ici...'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    // Report immédiat pour éviter l'expiration de l'interaction
    await submitted.deferUpdate().catch(() => {});

    state.title       = submitted.fields.getTextInputValue('eb_title').trim()       || null;
    state.description = submitted.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('Sélectionnez une couleur...')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'Entrer votre propre code couleur #RRGGBB'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🎨 Définir la couleur')
                .setDescription(
                    'Choisissez une palette prédéfinie ou sélectionnez **Hexadécimal perso** pour utiliser un code précis.',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        const picked = colorInter.values[0];

        if (picked === '__custom__') {
            const hexModal = new ModalBuilder()
                .setCustomId('eb_custom_hex')
                .setTitle('Couleur personnalisée')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('hex_value')
                            .setLabel('Code couleur Hexadécimal')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('#5865F2')
                            .setMaxLength(7)
                            .setMinLength(7)
                            .setRequired(true),
                    ),
                );

            await colorInter.showModal(hexModal);

            const hexSubmit = await colorInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!hexSubmit) return;

            const hex = hexSubmit.fields.getTextInputValue('hex_value').trim();
            if (!isValidHex(hex)) {
                await hexSubmit.reply({
                    embeds: [
                        errorEmbed(
                            'Code Hex invalide',
                            `\`${hex}\` n'est pas une couleur hexadécimale valide. Utilisez le format \`#RRGGBB\` (ex: \`#5865F2\`).`,
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            state.color = hex;
            await hexSubmit.deferUpdate().catch(() => {});
        } else {
            state.color = picked;
            await colorInter.deferUpdate().catch(() => {});
        }

        await refreshDashboard(rootInteraction, state);
    });
}

async function handleSetAuthor(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Définir l\'auteur')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Nom de l\'auteur (laisser vide pour retirer)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Ex: Mon Serveur ou Votre Pseudo'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('URL de l\'icône de l\'auteur (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://exemple.com/icone.png'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('Lien hypertexte sur l\'auteur (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://exemple.com'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name    = submitted.fields.getTextInputValue('author_name').trim();
    const iconUrl = submitted.fields.getTextInputValue('author_icon').trim();
    const url     = submitted.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'L\'URL de l\'icône d\'auteur doit être un lien direct valide en `https://`.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'Le lien de l\'auteur doit être une URL valide en `https://`.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Définir le pied de page')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Texte du pied de page (laisser vide pour retirer)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('Ex: Créé via TitanBot'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('URL de l\'icône du pied de page (optionnel)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://exemple.com/icone.png'),
            ),
        );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const text    = submitted.fields.getTextInputValue('footer_text').trim();
    const iconUrl = submitted.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await submitted.reply({
            embeds: [errorEmbed('URL invalide', 'L\'URL de l\'icône du pied de page doit être un lien valide en `https://`.')],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('Que voulez-vous modifier ?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la miniature')
                .setDescription('Petite image affichée dans le coin en haut à droite')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Définir la grande image')
                .setDescription('Bannière grand format située en bas de l\'embed')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retirer la miniature')
                .setDescription('Supprime la miniature actuelle de l\'aperçu')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Retirer la grande image')
                .setDescription('Supprime la bannière actuelle de l\'aperçu')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🖼️ Gérer les images')
                .setDescription('Choisissez l\'emplacement de l\'image à définir ou à effacer.')
                .addFields(
                    { name: 'Miniature (Thumbnail)',    value: state.thumbnail ? `[Voir l'image](${state.thumbnail})` : '`Non définie`', inline: true },
                    { name: 'Grande Image',  value: state.image     ? `[Voir l'image](${state.image})`     : '`Non définie`', inline: true },
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        const pick = imgInter.values[0];

        if (pick === 'clear_thumbnail') {
            state.thumbnail = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }
        if (pick === 'clear_image') {
            state.image = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }

        const isThumb = pick === 'set_thumbnail';

        const urlModal = new ModalBuilder()
            .setCustomId('eb_image_url')
            .setTitle(isThumb ? 'Définir la miniature' : 'Définir la grande image')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('image_url')
                        .setLabel('URL de l\'image')
                        .setStyle(TextInputStyle.Short)
                        .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                        .setRequired(true)
                        .setPlaceholder('https://exemple.com/image.png'),
                ),
            );

        await imgInter.showModal(urlModal);

        const submitted = await imgInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                time: 60_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const url = submitted.fields.getTextInputValue('image_url').trim();
        if (!isValidUrl(url)) {
            await submitted.reply({
                embeds: [
                    errorEmbed('URL invalide', 'L\'URL doit être un lien public direct en `https://` pointant vers une image accessible.'),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (isThumb) state.thumbnail = url;
        else         state.image     = url;

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferUpdate();
        await selectInteraction.followUp({
            embeds: [errorEmbed('Limite atteinte', `Les embeds ne peuvent contenir qu'un maximum de ${MAX_FIELDS} champs.`)],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Ajouter un champ');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('Nom du champ (max 256 caractères)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('Titre du champ'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('Contenu du champ (max 1024 caractères)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('Contenu ou texte du champ...'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'Non — pleine largeur (Bloc)', value: 'no' },
            { label: 'Oui — côte à côte (En ligne)', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('Afficher en ligne (Inline) ?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name     = submitted.fields.getTextInputValue('field_name').trim();
    const value    = submitted.fields.getTextInputValue('field_value').trim();
    const inline   = submitted.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('Choisissez un champ à modifier...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'En ligne' : 'Bloc'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('📝 Modifier un champ')
                .setDescription('Sélectionnez le champ que vous souhaitez ajuster.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        const idx   = parseInt(pickInter.values[0], 10);
        const field = state.fields[idx];
        if (!field) { await pickInter.deferUpdate(); return; }

        const modal = new ModalBuilder()
            .setCustomId('eb_edit_field_modal')
            .setTitle(`Modifier le champ ${idx + 1}`);

        const editNameLabel = new LabelBuilder()
            .setLabel('Nom du champ')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(field.name)
                    .setMaxLength(256)
                    .setRequired(true),
            );

        const editValueLabel = new LabelBuilder()
            .setLabel('Contenu du champ')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(field.value.substring(0, 4000))
                    .setMaxLength(1024)
                    .setRequired(true),
            );

        const editInlineRadio = new RadioGroupBuilder()
            .setCustomId('field_inline')
            .setRequired(false)
            .addOptions([
                { label: 'Non — pleine largeur (Bloc)', value: 'no' },
                { label: 'Oui — côte à côte (En ligne)', value: 'yes' },
            ]);
        
        // Cocher la valeur actuelle par défaut
        if (field.inline) {
            editInlineRadio.setOptions([
                { label: 'Non — pleine largeur (Bloc)', value: 'no' },
                { label: 'Oui — côte à côte (En ligne)', value: 'yes', default: true },
            ]);
        }

        const editInlineLabel = new LabelBuilder()
            .setLabel('Afficher en ligne (Inline) ?')
            .setRadioGroupComponent(editInlineRadio);

        modal.addLabelComponents(editNameLabel, editValueLabel, editInlineLabel);

        await pickInter.showModal(modal);

        const submitted = await pickInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_edit_field_modal' && i.user.id === pickInter.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const name   = submitted.fields.getTextInputValue('field_name').trim();
        const value  = submitted.fields.getTextInputValue('field_value').trim();
        const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

        state.fields[idx] = { name, value, inline };

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('Choisissez un champ à supprimer...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('➖ Supprimer un champ')
                .setDescription('Sélectionnez le champ que vous voulez retirer de l\'embed.')
                .setColor(getColor('warning')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferUpdate();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('Sélectionnez un champ à déplacer...');
    // Suite logique manquante dans l'extrait d'origine...
}
