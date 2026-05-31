import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

export default {
    data: new SlashCommandBuilder()
        .setName("meteo")
        .setDescription("Obtenir les informations météo en temps réel d'une ville")
        .addStringOption((option) =>
            option
                .setName("ville")
                .setDescription("Le nom de la ville, ex: 'Paris' ou 'Tokyo'")
                .setRequired(true),
        ),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Weather interaction defer failed`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'meteo'
                });
                return;
            }

            const city = interaction.options.getString("ville");

            const geoResponse = await fetch(
                `${GEOCODING_URL}?name=${encodeURIComponent(city)}`,
            );
            const geoData = await geoResponse.json();

            if (!geoData.results || geoData.results.length === 0) {
                logger.info(`Weather command - city not found`, {
                    userId: interaction.user.id,
                    city: city,
                    guildId: interaction.guildId
                });
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Ville introuvable",
                            `Impossible de trouver une localisation pour **${city}**. Veuillez vérifier l'orthographe.`,
                        ),
                    ],
                });
                return;
            }

            const { latitude, longitude, name, country } = geoData.results[0];
            const cityDisplay = name;

            const weatherResponse = await fetch(
                `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            );
            const weatherData = await weatherResponse.json();

            if (weatherData.error) {
                logger.error(`Weather API error`, {
                    error: weatherData.reason,
                    city: city,
                    userId: interaction.user.id,
                    guildId: interaction.guildId
                });
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "Erreur API",
                            "Une erreur est survenue avec le service météo.",
                        ),
                    ],
                });
                return;
            }

            const current = weatherData.current || weatherData.current_weather || {};
            const temperature = current.temperature != null ? Math.round(current.temperature) : "N/A";
            const humidity = current.relativehumidity ?? current.relative_humidity_2m ?? "N/A";
            const windSpeed = current.windspeed != null ? Math.round(current.windspeed) : "N/A";
            const weatherCode = current.weathercode ?? current.weather_code ?? null;

            const condition = getWeatherDescription(weatherCode);

            const embed = createEmbed({ title: `🌎 Météo à ${cityDisplay}, ${country}`, description: condition.description })
                .addFields(
                    {
                        name: "🌡️ Température",
                        value: `${temperature}°C`,
                        inline: true,
                    },
                    {
                        name: "💧 Humidité",
                        value: `${humidity}%`,
                        inline: true,
                    },
                    {
                        name: "💨 Vitesse du vent",
                        value: `${windSpeed} km/h`,
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Latitude: ${latitude.toFixed(2)} | Longitude: ${longitude.toFixed(2)}`,
                });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            logger.info(`Weather command executed`, {
                userId: interaction.user.id,
                city: cityDisplay,
                country: country,
                temperature: temperature,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Weather command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'meteo'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'meteo',
                source: 'weather_command'
            });
        }
    },
};

function getWeatherDescription(code) {
    if (code >= 0 && code <= 3) {
        return { description: "Ciel dégagé / Partiellement nuageux ☀️", emoji: "☀️" };
    } else if (code >= 45 && code <= 48) {
        return { description: "Brouillard et givre 🌫️", emoji: "🌫️" };
    } else if (code >= 51 && code <= 67) {
        return { description: "Bruine ou pluie 🌧️", emoji: "🌧️" };
    } else if (code >= 71 && code <= 75) {
        return { description: "Chutes de neige ❄️", emoji: "❄️" };
    } else if (code >= 80 && code <= 86) {
        return { description: "Averses (pluie/neige) 🌨️", emoji: "🌨️" };
    } else if (code >= 95 && code <= 99) {
        return { description: "Orage ⛈️", emoji: "⛈️" };
    }
    return { description: "Conditions inconnues.", emoji: "" };
}
