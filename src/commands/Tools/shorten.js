import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Raccourcir une URL en utilisant is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("L'URL à raccourcir")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Fin d'URL personnalisée (optionnel)")
                .setRequired(false)
        )
        .setDMPermission(false),
    category: "Tools",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferSuccess) {
            logger.warn(`Shorten interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        try {
            const url = interaction.options.getString("url");
            const custom = interaction.options.getString("custom");

            try {
                new URL(url);
            } catch (e) {
                const embed = errorEmbed("URL invalide", "Format d'URL invalide. Incluez http:// ou https://");
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                const embed = errorEmbed("URL personnalisée invalide", "L'URL personnalisée ne peut contenir que des lettres, des chiffres, des underscores et des traits d'union.");
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
            if (custom) {
                apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            let response;
            try {
                response = await fetch(apiUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'TitanBot URL Shortener/1.0'
                    }
                });
            } catch (networkError) {
                const message = networkError?.name === 'AbortError'
                    ? 'Le service de réduction d\'URL a expiré. Veuillez réessayer dans un instant.'
                    : 'Impossible de joindre le service de réduction d\'URL pour le moment. Veuillez réessayer plus tard.';
                const embed = errorEmbed('Erreur réseau', message);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                const embed = errorEmbed('Échec du raccourcissement', `Le service a renvoyé une erreur HTTP ${response.status}. Veuillez réessayer plus tard.`);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            const shortUrl = await response.text();

            try {
                new URL(shortUrl);
            } catch (e) {
                if (shortUrl.includes("already exists")) {
                    const embed = errorEmbed("URL déjà prise", "Cette URL personnalisée est déjà prise. Essayez-en une autre.");
                    embed.setColor(getColor('error'));
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [embed],
                    });
                } else if (shortUrl.includes("invalid")) {
                    const embed = errorEmbed("URL invalide", "URL invalide. Incluez http:// ou https://");
                    embed.setColor(getColor('error'));
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [embed],
                    });
                }
                const embed = errorEmbed("Échec du raccourcissement", `Le raccourcissement de l'URL a échoué : ${shortUrl}`);
                embed.setColor(getColor('error'));
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }

            const embed = successEmbed("URL raccourcie", `Voici votre URL raccourcie : ${shortUrl}`);
            embed.setColor(getColor('success'));
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'shorten'
            });
        }
    },
};
