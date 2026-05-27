import { SlashCommandBuilder, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import birthdaySet from './modules/birthday_set.js';
import birthdayInfo from './modules/birthday_info.js';
import birthdayList from './modules/birthday_list.js';
import birthdayRemove from './modules/birthday_remove.js';
import nextBirthdays from './modules/next_birthdays.js';
import birthdaySetchannel from './modules/birthday_setchannel.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Commandes du système d\'anniversaire')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Enregistrer votre date d\'anniversaire')
                .addIntegerOption(option =>
                    option
                        .setName('month')
                        .setDescription('Mois de naissance (1-12)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName('day')
                        .setDescription('Jour de naissance (1-31)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Afficher les informations d\'anniversaire')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('L\'utilisateur dont vous voulez vérifier l\'anniversaire')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lister tous les anniversaires du serveur')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Supprimer votre date d\'anniversaire')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('next')
                .setDescription('Afficher les prochains anniversaires')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('Définir ou désactiver le salon pour les annonces d\'anniversaire (Gérer le serveur requis)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Le salon textuel pour les annonces. Laissez vide pour désactiver.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false)
                )
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'set':
                    return await birthdaySet.execute(interaction, config, client);
                case 'info':
                    return await birthdayInfo.execute(interaction, config, client);
                case 'list':
                    return await birthdayList.execute(interaction, config, client);
                case 'remove':
                    return await birthdayRemove.execute(interaction, config, client);
                case 'next':
                    return await nextBirthdays.execute(interaction, config, client);
                case 'setchannel':
                    return await birthdaySetchannel.execute(interaction, config, client);
                default:
                    return InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed('Erreur', 'Sous-commande inconnue')],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error('Échec de l\'exécution de la commande d\'anniversaire', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday',
                subcommand: interaction.options.getSubcommand()
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday',
                source: 'birthday_command'
            });
        }
    }
};


