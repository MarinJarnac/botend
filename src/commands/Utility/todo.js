import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Gérez votre liste de tâches personnelle")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Ajouter une tâche à votre liste")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("La tâche à ajouter")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Voir votre liste de tâches")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Marquer une tâche comme terminée")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Le numéro de la tâche à terminer")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Supprimer une tâche de votre liste")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("Le numéro de la tâche à supprimer")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Gérer les listes de tâches partagées")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Créer une nouvelle liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Nom de la liste partagée")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Ajouter un membre à une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("Utilisateur à ajouter à la liste")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("Voir une liste de tâches partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Ajouter une tâche à une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("La tâche à ajouter")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Supprimer une tâche d'une liste partagée")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID de la liste partagée")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("Le numéro de la tâche à supprimer")
                                .setRequired(true)
                        )
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();
        const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrCreateSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.error)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        members: [creatorId],
                        tasks: [],
                        nextId: 1,
                        createdAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.nextId) listData.nextId = 1;
                if (!Array.isArray(listData.members)) listData.members = [];
            }
            
            return listData;
        }

        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Todo interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'todo'
                });
                return;
            }

            if (shareSubcommand) {
                switch (shareSubcommand) {
                    case 'create': {
                        const listName = interaction.options.getString('name');
                        const listId = generateShareId();
                        
                        await getOrCreateSharedList(listId, userId, listName);
                        
                        const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                        const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                        if (!sharedListsArray.includes(listId)) {
                            sharedListsArray.push(listId);
                            await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                        }
                        
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(
                                    "Liste partagée créée",
                                    `Liste partagée "${listName}" créée avec l'ID : \`${listId}\`\n` +
                                    `Utilisez \`/todo share add list_id:${listId} user:@utilisateur\` pour ajouter des membres.`
                                )
                            ]
                        });
                    }
                    
                    case 'add': {
                        const listId = interaction.options.getString('list_id');
                        const memberToAdd = interaction.options.getUser('user');
                        
                        const listData = await getOrCreateSharedList(listId);
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Liste partagée introuvable.")]
                            });
                        }
                        
                        if (listData.creatorId !== userId) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Seul le créateur de la liste peut ajouter des membres.")]
                            });
                        }
                        
                        if (!listData.members.includes(memberToAdd.id)) {
                            listData.members.push(memberToAdd.id);
                            await setInDb(`shared_todo_${listId}`, listData);
                            
                            const memberLists = await getFromDb(`user_shared_lists_${memberToAdd.id}`, []);
                            const memberListsArray = Array.isArray(memberLists) ? memberLists : [];
                            if (!memberListsArray.includes(listId)) {
                                memberListsArray.push(listId);
                                await setInDb(`user_shared_lists_${memberToAdd.id}`, memberListsArray);
                            }
                            
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [
                                    successEmbed("Membre ajouté", 
                                        `Ajout de ${memberToAdd.username} à la liste partagée "${listData.name}"`
                                    )
                                ]
                            });
                        } else {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "L'utilisateur est déjà membre de cette liste.")]
                            });
                        }
                    }
                    
                    case 'view': {
                        const listId = interaction.options.getString('list_id');
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Liste partagée introuvable.")]
                            });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Vous n'avez pas accès à cette liste.")]
                            });
                        }
                        
                        if (listData.tasks.length === 0) {
                            const memberList = listData.members.map(memberId => {
                                const member = interaction.guild.members.cache.get(memberId);
                                return member ? member.user.username : `<@${memberId}>`;
                            }).join(', ');
                            
                            const owner = interaction.guild.members.cache.get(listData.creatorId);
                            const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;
                            
                            return await InteractionHelper.safeEditReply(interaction, {
                                    embeds: [
                                        successEmbed(
                                            `📋 **${listData.name}**\n\n` +
                                            `👑 **Propriétaire :** ${ownerName}\n` +
                                            `👥 **Membres :** ${memberList}\n\n` +
                                            `*Cette liste est actuellement vide. Utilisez les boutons ci-dessous pour ajouter des tâches !*`,
                                            `Liste partagée (ID : \`${listId}\`)`
                                        )
                                    ],
                                    components: [
                                        new ActionRowBuilder().addComponents(
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_add_${listId}`)
                                                .setLabel('Ajouter tâche')
                                                .setStyle(ButtonStyle.Primary),
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_complete_${listId}`)
                                                .setLabel('Terminer tâche')
                                                .setStyle(ButtonStyle.Success),
                                            new ButtonBuilder()
                                                .setCustomId(`shared_todo_remove_${listId}`)
                                                .setLabel('Supprimer tâche')
                                                .setStyle(ButtonStyle.Danger)
                                        )
                                    ]
                                });
                        }
                        
                        const taskList = listData.tasks
                            .map(task => 
                                `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
                                `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
                                (task.completed ? ` • Terminé par ${task.completedBy}` : '') + '`'
                            )
                            .join('\n');

                        const memberList = listData.members.map(memberId => {
                            const member = interaction.guild.members.cache.get(memberId);
                            return member ? member.user.username : `<@${memberId}>`;
                        }).join(', ');
                        
                        const owner = interaction.guild.members.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        const fullListDisplay = `📋 **${listData.name}**\n\n` +
                            `👑 **Propriétaire :** ${ownerName}\n` +
                            `👥 **Membres :** ${memberList}\n\n` +
                            `**Tâches :**\n${taskList}`;

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed(fullListDisplay, `Liste partagée (ID : \`${listId}\`)`)
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_add_${listId}`)
                                        .setLabel('Ajouter tâche')
                                        .setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_complete_${listId}`)
                                        .setLabel('Terminer tâche')
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId(`shared_todo_remove_${listId}`)
                                        .setLabel('Supprimer tâche')
                                        .setStyle(ButtonStyle.Danger)
                                )
                            ]
                        });
                    }
                    
                    case 'addtask': {
                        const listId = interaction.options.getString('list_id');
                        const taskText = interaction.options.getString('task');
                        
                        const listData = await getOrCreateSharedList(listId);
                        
                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Liste partagée introuvable.")]
                            });
                        }
                        
                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Vous n'avez pas accès à cette liste.")]
                            });
                        }
                        
                        const newTask = {
                            id: listData.nextId++,
                            text: taskText,
                            completed: false,
                            createdAt: new Date().toISOString(),
                            createdBy: userId
                        };
                        
                        listData.tasks.push(newTask);
                        await setInDb(`shared_todo_${listId}`, listData);
                        
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed("Tâche ajoutée", `"${taskText}" ajoutée à la liste partagée "${listData.name}"`)
                            ]
                        });
                    }

                    case 'remove': {
                        const listId = interaction.options.getString('list_id');
                        const taskNumber = interaction.options.getInteger('number');

                        const listData = await getOrCreateSharedList(listId);

                        if (!listData) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Liste partagée introuvable.")]
                            });
                        }

                        if (!listData.members.includes(userId)) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Vous n'avez pas accès à cette liste.")]
                            });
                        }

                        const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                        if (taskIndex === -1) {
                            return await InteractionHelper.safeEditReply(interaction, {
                                embeds: [errorEmbed("Erreur", "Tâche introuvable.")]
                            });
                        }

                        const [removedTask] = listData.tasks.splice(taskIndex, 1);
                        await setInDb(`shared_todo_${listId}`, listData);

                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [
                                successEmbed("Tâche supprimée", `"${removedTask.text}" supprimée de la liste partagée "${listData.name}".`)
                            ]
                        });
                    }
                }
                return;
            }

            const dbKey = `todo_${userId}`;
            
            const userData = await getFromDb(dbKey, {
                tasks: [],
                nextId: 1
            });
            
            if (!userData.tasks) userData.tasks = [];
            if (!userData.nextId) userData.nextId = 1;

            switch (subcommand) {
                case 'add': {
                    const taskText = interaction.options.getString('task');
                    
                    const newTask = {
                        id: userData.nextId++,
                        text: taskText,
                        completed: false,
                        createdAt: new Date().toISOString()
                    };
                    
                    userData.tasks.push(newTask);
                    await setInDb(dbKey, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(
                                "Tâche ajoutée",
                                `"${taskText}" a été ajoutée à votre liste de tâches.`
                            ),
                        ],
                    });
                }

                case 'list': {
                    if (userData.tasks.length === 0) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [successEmbed("Votre liste de tâches est vide !", "Votre liste de tâches")],
                        });
                    }

                    const taskList = userData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
                            `\`[${new Date(task.createdAt).toLocaleDateString()}]\``
                        )
                        .join('\n');

                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed(taskList, "Votre liste de tâches")
                        ],
                    });
                }

                case 'complete': {
                    const taskNumber = interaction.options.getInteger('number');
                    const task = userData.tasks.find(t => t.id === taskNumber);
                    
                    if (!task) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed("Erreur", "Tâche introuvable.")],
                        });
                    }

                    if (task.completed) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed("Tâche déjà terminée", `La tâche #${task.id} est déjà terminée.`)],
                        });
                    }
                    
                    task.completed = true;
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed("Tâche terminée", `"${task.text}" marquée comme terminée !`)
                        ],
                    });
                }

                case 'remove': {
                    const taskNumber = interaction.options.getInteger('number');
                    const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);
                    
                    if (taskIndex === -1) {
                        return await InteractionHelper.safeEditReply(interaction, {
                            embeds: [errorEmbed("Erreur", "Tâche introuvable.")],
                        });
                    }
                    
                    const [removedTask] = userData.tasks.splice(taskIndex, 1);
                    await setInDb(`todo_${userId}`, userData);
                    
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            successEmbed("Tâche supprimée", `"${removedTask.text}" supprimée de votre liste de tâches.`)
                        ],
                    });
                }

                default:
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed("Erreur", "Sous-commande invalide.")],
                    });
            }
        } catch (error) {
            logger.error(`Todo command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'todo',
                source: 'todo_command'
            });
        }
    },
};
