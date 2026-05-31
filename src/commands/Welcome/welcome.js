import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Configurer le système de bienvenue')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configurer le message de bienvenue')
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Le salon où envoyer les messages de bienvenue')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Message de bienvenue. Variables : {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL de l\'image à inclure dans le message de bienvenue')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Mentionner l\'utilisateur dans le message de bienvenue')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Échec du defer pour l'interaction welcome`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'welcome'
                });
                return;
            }
        } catch (deferError) {
            logger.error(`Erreur lors du defer welcome`, { error: deferError.message });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Permissions manquantes', 'Vous avez besoin de la permission **Gérer le serveur** pour utiliser `/welcome`.')],
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('salon');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.channelId) {
                logger.info(`[Welcome] Configuration bloquée : existe déjà pour la guilde ${guild.id}`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Configuration déjà existante',
                        `Le système de bienvenue est déjà configuré pour <#${existingConfig.channelId}>. Utilisez **/welcome config** pour personnaliser le salon, le message, la mention ou l'image.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!message || message.trim().length === 0) {
                logger.warn(`[Welcome] Message vide fourni par ${interaction.user.tag} dans ${guild.name}`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Entrée invalide', 'Le message de bienvenue ne peut pas être vide.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Welcome] URL d'image invalide fournie par ${interaction.user.tag} : ${image}`);
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('URL d\'image invalide', 'Veuillez fournir une URL d\'image valide (doit commencer par http:// ou https://).')],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    enabled: true,
                    channelId: channel.id,
                    welcomeMessage: message,
                    welcomeImage: image || undefined,
                    welcomePing: ping
                });

                logger.info(`[Welcome] Configuration effectuée par ${interaction.user.tag} pour la guilde ${guild.name} (${guild.id})`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('✅ Système de bienvenue configuré')
                    .setDescription(`Les messages de bienvenue seront désormais envoyés dans ${channel}`)
                    .addFields(
                        { name: 'Aperçu du message', value: previewMessage },
                        { name: 'Mentionner l\'utilisateur', value: ping ? '✅ Oui' : '❌ Non' },
                        { name: 'Statut', value: '✅ Activé' }
                    )
                    .setFooter({ text: 'Astuce : Utilisez /welcome config pour personnaliser les paramètres.' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Welcome] Échec de la configuration pour la guilde ${guild.id} :`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Échec de la configuration',
                        'Une erreur est survenue lors de la configuration. Veuillez réessayer.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};
