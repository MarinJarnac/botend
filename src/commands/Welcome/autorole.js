import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';

function createAutoroleInfoEmbed(description) {
    return new EmbedBuilder()
        .setColor(getColor('primary'))
        .setDescription(description)
        .setFooter({ text: new Date().toLocaleString() });
}

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Gérer les rôles automatiquement attribués aux nouveaux membres')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter un rôle à attribuer automatiquement')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Le rôle à ajouter')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer un rôle de l\'attribution automatique')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Le rôle à retirer')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lister les rôles attribués automatiquement')),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Autorole interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'autorole'
            });
            return;
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Permissions manquantes', 'Vous avez besoin de la permission **Gérer le serveur** pour utiliser `/autorole`.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const { options, guild, client } = interaction;
        const subcommand = options.getSubcommand();

        if (subcommand === 'add') {
            const role = options.getRole('role');

            const guildConfig = await getGuildConfig(client, guild.id);
            const verificationEnabled = Boolean(guildConfig.verification?.enabled);
            const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);

            if (verificationEnabled || autoVerifyEnabled) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Conflit de configuration',
                        'Vous ne pouvez pas ajouter d\'AutoRole si le système de vérification ou AutoVerify est activé. Désactivez-les d\'abord.'
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (role.position >= guild.members.me.roles.highest.position) {
                return InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Rôle trop élevé', 'Je ne peux pas attribuer de rôles situés au-dessus du mien dans la hiérarchie.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                const currentRoleId = existingRoles[0] || null;
                
                if (currentRoleId === role.id) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Déjà ajouté', `Le rôle ${role} est déjà configuré pour l'attribution automatique.`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                await updateWelcomeConfig(client, guild.id, {
                    roleIds: [role.id]
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(
                        currentRoleId
                            ? `✅ AutoRole mis à jour vers ${role}. Un seul rôle est autorisé à la fois.`
                            : `✅ AutoRole défini sur ${role}.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Échec de l'ajout du rôle pour la guilde ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Échec de l\'ajout',
                        'Une erreur est survenue lors de l\'ajout du rôle. Veuillez réessayer.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        } 
        
        else if (subcommand === 'remove') {
            const role = options.getRole('role');

            try {
                const config = await getWelcomeConfig(client, guild.id);
                const existingRoles = config.roleIds || [];
                
                if (!existingRoles.includes(role.id)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('Non trouvé', `Le rôle ${role} n'est pas configuré pour l'attribution automatique.`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const updatedRoles = existingRoles.filter(id => id !== role.id);
                
                await updateWelcomeConfig(client, guild.id, {
                    roleIds: updatedRoles
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createAutoroleInfoEmbed(`✅ ${role} a été retiré des rôles automatiquement attribués.`)],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error(`[Autorole] Échec du retrait du rôle pour la guilde ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Échec du retrait',
                        'Une erreur est survenue lors du retrait du rôle. Veuillez réessayer.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
        
        else if (subcommand === 'list') {
            try {
                const guildConfig = await getGuildConfig(client, guild.id);
                const verificationEnabled = Boolean(guildConfig.verification?.enabled);
                const autoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
                const conflictSummary = [
                    verificationEnabled ? 'Le système de vérification est activé' : null,
                    autoVerifyEnabled ? 'AutoVerify est activé' : null
                ].filter(Boolean).join('\n');

                const config = await getWelcomeConfig(client, guild.id);
                const autoRoles = Array.isArray(config.roleIds) ? config.roleIds : [];

                const singleRoleIds = autoRoles.length > 1 ? [autoRoles[0]] : autoRoles;
                if (singleRoleIds.length !== autoRoles.length) {
                    await updateWelcomeConfig(client, guild.id, { roleIds: singleRoleIds });
                }

                if (singleRoleIds.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Aucun rôle n'est configuré pour l'attribution automatique.${conflictSummary ? `\n\n⚠️ Bloqueurs : \n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roles = await guild.roles.fetch();
                const validRoles = singleRoleIds.map(id => roles.get(id)).filter(Boolean);

                if (validRoles.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [createAutoroleInfoEmbed(`ℹ️ Aucun rôle valide trouvé.${conflictSummary ? `\n\n⚠️ Bloqueurs : \n${conflictSummary}` : ''}`)],
                        flags: MessageFlags.Ephemeral
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(getColor('info'))
                    .setTitle('Rôle attribué automatiquement')
                    .setDescription(`${validRoles[0]}${conflictSummary ? `\n\n⚠️ Bloqueurs : \n${conflictSummary}` : ''}`)
                    .setFooter({ text: 'Un seul rôle peut être configuré.' });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logger.error(`[Autorole] Échec de la liste pour la guilde ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Échec de l\'affichage',
                        'Une erreur est survenue lors de la récupération des rôles. Veuillez réessayer.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};
