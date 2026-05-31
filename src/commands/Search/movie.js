import axios from 'axios';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY || '4e44d9029b1270a757cddc766a1bcb63';
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

export default {
    data: new SlashCommandBuilder()
        .setName("film")
        .setDescription("Rechercher un film ou une série TV")
        .addStringOption((option) =>
            option
                .setName("titre")
                .setDescription("Le titre du film ou de la série")
                .setRequired(true)
                .setMaxLength(100),
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Le type de contenu à rechercher")
                .addChoices(
                    { name: "Film", value: "movie" },
                    { name: "Série TV", value: "tv" },
                )
                .setRequired(false),
        ),
        
    async execute(interaction) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) return;

            const guildConfig = await getGuildConfig(
                interaction.client,
                interaction.guild?.id,
            );
            
            // Vérification si la commande est désactivée sur le serveur
            if (guildConfig?.disabledCommands?.includes("movie") || guildConfig?.disabledCommands?.includes("film")) {
                logger.warn('Commande film desactivee sur ce serveur', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'film'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Commande désactivée",
                            "La recherche de films/séries est désactivée sur ce serveur.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (!TMDB_API_KEY) {
                logger.error('Cle API TMDB non configuree', {
                    guildId: interaction.guildId,
                    commandName: 'film'
                });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Erreur de configuration",
                            "La recherche de films/séries n'est pas correctement configurée.",
                        ),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const title = interaction.options.getString("titre");
            const type = interaction.options.getString("type") || "movie";

            logger.debug('Recherche de film initialisee', {
                userId: interaction.user.id,
                title: title,
                type: type,
                guildId: interaction.guildId
            });

            // 1. Premier appel pour chercher le média
            const searchResponse = await axios.get(
                `https://api.themoviedb.org/3/search/${type}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        query: title,
                        include_adult: guildConfig?.allowNsfwContent ? undefined : false,
                        language: guildConfig?.language || "fr-FR", // Traduction par défaut en français
                        page: 1,
                        region: guildConfig?.region || "FR",
                    },
                    timeout: 8000,
                },
            );

            if (!searchResponse.data?.results?.length) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Introuvable",
                            `Aucun résultat trouvé pour "${title}" dans la catégorie ${type === "movie" ? "Films" : "Séries TV"}.`,
                        ),
                    ],
                });
            }

            const result = searchResponse.data.results[0];
            const mediaType = type === "movie" ? "Film" : "Série TV";
            const mediaTitle = result.title || result.name || "Titre inconnu";
            const releaseDate = result.release_date || result.first_air_date;
            const year = releaseDate ? new Date(releaseDate).getFullYear() : "N/A";

            // 2. Deuxième appel pour obtenir les détails complets (casting, certification, etc.)
            const detailsResponse = await axios.get(
                `https://api.themoviedb.org/3/${type}/${result.id}`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: guildConfig?.language || "fr-FR",
                        append_to_response: "credits,release_dates,content_ratings",
                    },
                    timeout: 8000,
                },
            );

            const details = detailsResponse.data;
            
            // Formatage de la durée
            const runtime = details.runtime
                ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                : details.episode_run_time?.[0]
                  ? `${details.episode_run_time[0]}m par épisode`
                  : "N/A";

            // Récupération de la certification d'âge (Priorité FR si dispo, sinon US)
            let contentRating = "N/A";
            if (type === "movie") {
                const frCert = details.release_dates?.results?.find((r) => r.iso_3166_1 === "FR");
                const usCert = details.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
                const certification = frCert?.release_dates?.[0]?.certification || usCert?.release_dates?.[0]?.certification;
                if (certification) contentRating = certification;
            } else {
                const frCert = details.content_ratings?.results?.find((r) => r.iso_3166_1 === "FR");
                const usCert = details.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
                const rating = frCert?.rating || usCert?.rating;
                if (rating) contentRating = rating;
            }

            const genres = details.genres?.map((g) => g.name).join(", ") || "N/A";
            const cast = details.credits?.cast?.slice(0, 3).map((p) => p.name).join(", ") || "N/A";

            // Création de l'embed final
            const embed = createEmbed({
                title: `${mediaTitle} (${year})`,
                description: details.overview || "Aucun résumé disponible.",
                color: 'info'
            })
                .setURL(`https://www.themoviedb.org/${type}/${result.id}`)
                .setThumbnail(
                    result.poster_path ? `${IMAGE_BASE_URL}${result.poster_path}` : null,
                )
                .addFields(
                    { name: "Type", value: mediaType, inline: true },
                    {
                        name: "Note",
                        value: result.vote_average
                            ? `⭐ ${result.vote_average.toFixed(1)}/10 (${result.vote_count.toLocaleString('fr-FR')} votes)`
                            : "N/A",
                        inline: true,
                    },
                    { name: "Classification", value: contentRating, inline: true },
                    { name: "Durée", value: runtime, inline: true },
                    {
                        name: "Date de sortie",
                        value: releaseDate
                            ? new Date(releaseDate).toLocaleDateString('fr-FR')
                            : "N/A",
                        inline: true,
                    },
                    { name: "Genres", value: genres, inline: true },
                    { name: "Distribution", value: cast, inline: false },
                )
                .setFooter({
                    text: "Propulsé par The Movie Database",
                    iconURL: "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg",
                });

            if (result.backdrop_path) {
                embed.setImage(`https://image.tmdb.org/t/p/w1280${result.backdrop_path}`);
            }

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Informations media recuperees', {
                userId: interaction.user.id,
                title: title,
                type: type,
                resultTitle: mediaTitle,
                guildId: interaction.guildId,
                commandName: 'film'
            });

        } catch (error) {
            logger.error('Erreur lors de la recherche de film/série', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'film'
            });

            if (error.response?.status === 404) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Introuvable', 'Le film ou la série TV demandé reste introuvable.')]
                });
            } else if (error.response?.status === 401) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Erreur de configuration', 'Clé API TMDB invalide. Veuillez contacter l\'administrateur du bot.')],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'film',
                    source: 'tmdb_api'
                });
            }
        }
    },
};
