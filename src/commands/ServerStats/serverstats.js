import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("stats_serveur")
        .setDescription("Gérer les salons de statistiques du serveur (compteur de membres, bots, etc.)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        
        // Sous-commande : Créer
        .addSubcommand(subcommand =>
            subcommand
                .setName("creer")
                .setDescription("Créer un nouveau salon compteur de statistiques dans une catégorie")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Le type de données à suivre")
                        .setRequired(true)
                        .addChoices(
                            { name: "membres + bots", value: "members" },
                            { name: "membres uniquement", value: "members_only" },
                            { name: "bots uniquement", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("type_salon")
                        .setDescription("Le type de salon à créer pour ce compteur")
                        .setRequired(true)
                        .addChoices(
                            { name: "salon vocal (recommandé)", value: "voice" },
                            { name: "salon textuel", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("categorie")
                        .setDescription("La catégorie dans laquelle créer le salon de statistiques")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        
        // Sous-commande : Liste
        .addSubcommand(subcommand =>
            subcommand
                .setName("liste")
                .setDescription("Lister tous les compteurs de statistiques actifs sur ce serveur")
        )
        
        // Sous-commande : Modifier
        .addSubcommand(subcommand =>
            subcommand
                .setName("modifier")
                .setDescription("Modifier un compteur de statistiques existant")
                .addStringOption(option =>
                    option
                        .setName("id_compteur")
                        .setDescription("L'ID du compteur à mettre à jour")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Le nouveau type de données à suivre")
                        .setRequired(false)
                        .addChoices(
                            { name: "membres + bots", value: "members" },
                            { name: "membres uniquement", value: "members_only" },
                            { name: "bots uniquement", value: "bots" }
                        )
                )
        )
        
        // Sous-commande : Supprimer
        .addSubcommand(subcommand =>
            subcommand
                .setName("supprimer")
                .setDescription("Supprimer un compteur de statistiques existant")
                .addStringOption(option =>
                    option
                        .setName("id_compteur")
                        .setDescription("L'ID du compteur à supprimer")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case "creer":
                    await handleCreate(interaction, client);
                    break;
                case "liste":
                    await handleList(interaction, client);
                    break;
                case "modifier":
                    await handleUpdate(interaction, client);
                    break;
                case "supprimer":
                    await handleDelete(interaction, client);
                    break;
                default:
                    await InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed("Sous-commande inconnue.")],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error(`Erreur dans la commande stats_serveur [${subcommand}] :`, error);
            
            const errorEmbedMsg = createEmbed({ 
                title: "❌ Erreur", 
                description: "Une erreur est survenue lors du traitement de votre demande.",
                color: getColor('error')
            });

            if (!interaction.replied && !interaction.deferred) {
                await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            } else {
                await interaction.followUp({ embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            }
        }
    }
};
