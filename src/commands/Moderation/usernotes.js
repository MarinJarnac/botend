import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/sanitization.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

function getUserNotesKey(guildId, userId) {
    return `moderation_user_notes_${guildId}_${userId}`;
}

function getGuildNotesListKey(guildId) {
    return `moderation_user_notes_list_${guildId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Gérer les notes des utilisateurs à des fins de modération")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Ajouter une note à un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur à qui ajouter la note")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Le contenu de la note")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Le type de note")
                        .addChoices(
                            { name: "Avertissement (Warning)", value: "warning" },
                            { name: "Positif", value: "positive" },
                            { name: "Neutre", value: "neutral" },
                            { name: "Alerte", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Afficher les notes d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur dont vous voulez voir les notes")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Supprimer une note spécifique d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur concerné par la note à supprimer")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("L'index (numéro) de la note à supprimer")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Effacer toutes les notes d'un utilisateur")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("L'utilisateur dont vous voulez vider les notes")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Permission refusée",
                        "Vous n'avez pas la permission de gérer les notes des utilisateurs."
                    ),
                ],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Sous-commande invalide",
                        "Veuillez sélectionner une sous-commande valide."
                    ),
                ],
            });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [
                            errorEmbed(
                                "Sous-commande invalide",
                                "Veuillez sélectionner une sous-commande valide."
                            ),
                        ],
                    });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    errorEmbed(
                        "Erreur système",
                        "Une erreur est survenue lors du traitement de votre demande. Veuillez réessayer plus tard."
                    ),
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Note trop longue",
                    "Les notes ne doivent pas dépasser 1000 caractères."
                ),
            ],
        });
    }

    if (note.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Note vide",
                    "Le contenu de la note ne peut pas être vide."
                ),
            ],
        });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note ajoutée`,
                `Note de type **${type}** ajoutée avec succès pour **${targetUser.tag}** :\n\n` +
                `> ${note}\n\n` +
                `**Modérateur :** ${interaction.user.tag}\n` +
                `**Total des notes :** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Aucune note",
                    `Il n'y a aucune note enregistrée pour **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Notes pour ${targetUser.tag} (${targetUser.id}) :**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString('fr-FR');
        description += `${typeInfo.emoji} **Note #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Ajoutée par ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(tronqué)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Notes de l'utilisateur (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                errorEmbed(
                    "Index invalide",
                    `Veuillez fournir un index de note valide (1-${notes.length}).`
                ),
            ],
        });
    }

    const removedNote = notes[index];
    notes.splice(index, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note supprimée`,
                `La note #${index + 1} a été retirée de **${targetUser.tag}** :\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Notes restantes :** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Aucune note à effacer",
                    `Il n'y a aucune note à vider pour **${targetUser.tag}**.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Notes vidées",
                `Toutes les **${noteCount}** notes de **${targetUser.tag}** ont été effacées.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
