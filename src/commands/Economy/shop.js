import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Commandes liées à la boutique économique.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Parcourir les articles de la boutique.'),
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Configurer les paramètres de la boutique (Gérer le serveur requis).')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setrole')
                        .setDescription('Définir le rôle Discord attribué lors de l\'achat de l\'article Rôle Premium.')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Le rôle à attribuer pour les achats du Rôle Premium.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'browse') {
                return await shopBrowse.execute(interaction, config, client);
            }

            if (subcommandGroup === 'config' && subcommand === 'setrole') {
                return await shopConfigSetrole.execute(interaction, config, client);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Erreur', 'Sous-commande inconnue.')],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('shop command error:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Une erreur est survenue lors de l\'exécution de la commande de la boutique.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};
