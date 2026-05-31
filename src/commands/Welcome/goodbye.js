import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Configurer le système de messages de départ')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configurer le message de départ')
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Le salon où envoyer les messages de départ')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Message de départ. Variables : {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL de l\'image à inclure dans le message')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Mentionner l\'utilisateur dans le message de départ')
                        .setRequired(false))),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Goodbye interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Permissions manquantes', 'Vous avez besoin de la permission **Gérer le serveur** pour utiliser `/goodbye`.')],
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
            if (existingConfig?.goodbyeChannelId) {
                logger.info(`[Goodbye] Setup blocked: config exists for guild ${guild.id}`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Configuration déjà existante',
                        `Le système de départ est déjà configuré pour <#${existingConfig.goodbyeChannelId}>. Utilisez **/goodbye config** pour modifier le salon, le message, la mention ou l'image.`
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Empty message by ${interaction.user.tag}`);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Entrée invalide', 'Le message de départ ne peut pas être vide.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Invalid image URL by ${interaction.user.tag}: ${image}`);
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [errorEmbed('URL d\'image invalide', 'Veuillez fournir une URL d\'image valide (doit commencer par http:// ou https://).')],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "Au revoir {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `Départ du serveur ${guild.name} !`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(`[Goodbye] Setup by ${interaction.user.tag} for guild ${guild.id}`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('✅ Système de départ configuré')
                    .setDescription(`Les messages de départ seront désormais envoyés dans ${channel}`)
                    .addFields(
                        { name: 'Aperçu du message', value: previewMessage },
                        { name: 'Mentionner l\'utilisateur', value: ping ? '✅ Oui' : '❌ Non' },
                        { name: 'Statut', value: '✅ Activé' }
                    )
                    .setFooter({ text: 'Astuce : Utilisez /goodbye config pour personnaliser les paramètres.' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] Failed to setup goodbye for guild ${guild.id}:`, error);
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(
                        'Échec de la configuration',
                        'Une erreur est survenue lors de la configuration du système. Veuillez réessayer.',
                        { showDetails: true }
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};
