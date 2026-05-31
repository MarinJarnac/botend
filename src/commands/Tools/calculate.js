import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

// Stockage du contexte de calcul pour les gestionnaires de modaux
const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Évalue une expression mathématique")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "L'expression mathématique à évaluer (ex: 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Calculate interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        try {
            const expression = interaction.options.getString("expression");

            if (
                !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
            ) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            "❌ Expression invalide",
                            "**Contient des caractères non supportés.**\n\n" +
                                "✅ Supportés : Nombres, décimales, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n" +
                                "❌ Non supportés : Crochets, accolades et autres symboles spéciaux",
                        ),
                    ],
                });
            }

            const dangerousPatterns = [
                /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
                /`/g, 
                /\$\{.*\}/,
                /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
                /\b(?:while|for)\s*\([^)]*\)\s*\{/,
                /\b(?:function\*|yield|await|async)\b/,
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(expression)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                "🔒 Alerte de sécurité",
                                "**Contient des structures de code bloquées.**\n\n" +
                                    "🚫 **Bloqués :** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, boucles, async/await\n\n" +
                                    "La syntaxe typée 'code' n'est pas autorisée dans les calculs.",
                            ),
                        ],
                        flags: ["Ephemeral"],
                    });
                }
            }

            let result;
            try {
                result = evaluate(expression);

                let formattedResult;
                if (typeof result === "number") {
                    formattedResult = result.toLocaleString("fr-FR", {
                        maximumFractionDigits: 10,
                    });

                    if (
                        Math.abs(result) > 0 &&
                        (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                    ) {
                        formattedResult = result.toExponential(6);
                    }
                } else if (typeof result === "boolean") {
                    formattedResult = result ? "vrai" : "faux";
                } else if (result === null || result === undefined) {
                    formattedResult = "Aucun résultat";
                } else if (
                    Array.isArray(result) ||
                    typeof result === "object"
                ) {
                    formattedResult =
                        "```json\n" + JSON.stringify(result, null, 2) + "\n```";
                } else {
                    formattedResult = String(result);
                }

                const userId = interaction.user.id;
                if (!calculationHistory.has(userId)) {
                    calculationHistory.set(userId, []);
                }

                const history = calculationHistory.get(userId);
                history.unshift({
                    expression,
                    result: formattedResult,
                    timestamp: Date.now(),
                });

                if (history.length > MAX_HISTORY) {
                    history.pop();
                }

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`calc_${interaction.id}_add`)
                        .setLabel("+")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`calc_${interaction.id}_subtract`)
                        .setLabel("-")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`calc_${interaction.id}_multiply`)
                        .setLabel("×")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`calc_${interaction.id}_divide`)
                        .setLabel("÷")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`calc_${interaction.id}_history`)
                        .setLabel("Historique")
                        .setStyle(ButtonStyle.Secondary),
                );

                const embed = successEmbed(
                    "🧮 Résultat du calcul",
                    `**Expression :** \`${expression.replace(/`/g, "\`")}\`\n` +
                        `**Résultat :** \`${formattedResult}\`\n\n` +
                        `*Utilisez les boutons ci-dessous pour effectuer des opérations à partir de ce résultat.*`,
                );

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    components: [row],
                });

                const filter = (i) =>
                    i.customId.startsWith(`calc_${interaction.id}`) &&
                    i.user.id === interaction.user.id;
                const BUTTON_TIMEOUT = 300000;
                const collector =
                    interaction.channel.createMessageComponentCollector({
                        filter,
                        time: BUTTON_TIMEOUT,
                    });

                collector.on("collect", async (i) => {
                    try {
                        const operation = i.customId.split("_")[2];

                        if (operation === "history") {
                            if (!i.deferred && !i.replied) {
                                await i.deferUpdate().catch(console.error);
                            }

                            const userHistory =
                                calculationHistory.get(userId) || [];

                            if (userHistory.length === 0) {
                                await i.followUp({
                                    content: "Aucun historique de calcul trouvé.",
                                    flags: ["Ephemeral"],
                                });
                                return;
                            }

                            const historyText = userHistory
                                .map(
                                    (item, index) =>
                                        `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                        `    <t:${Math.floor(item.timestamp / 1000)}:R>`,
                                )
                                .join("\n\n");

                            await i.followUp({
                                content: `📜 **Votre historique de calculs**\n\n${historyText}`,
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        let operator = "";
                        let opLabel = "";

                        switch (operation) {
                            case "add":
                                operator = "+";
                                opLabel = "additionner";
                                break;
                            case "subtract":
                                operator = "-";
                                opLabel = "soustraire";
                                break;
                            case "multiply":
                                operator = "*";
                                opLabel = "multiplier";
                                break;
                            case "divide":
                                operator = "/";
                                opLabel = "diviser";
                                break;
                        }

                        try {
                            const contextKey = `${i.user.id}_${operation}`;
                            calculationContexts.set(contextKey, {
                                expression,
                                formattedResult,
                                operator,
                                messageId: interaction.message?.id,
                                channelId: interaction.channelId,
                                userId: i.user.id
                            });

                            await i.showModal({
                                customId: `calc_modal:${operation}`,
                                title: `Entrez un nombre pour l'opération`,
                                components: [
                                    {
                                        type: 1,
                                        components: [
                                            {
                                                type: 4,
                                                customId: `operand:${contextKey}`,
                                                label: `Nombre à ${opLabel} avec ${formattedResult}`,
                                                placeholder: "Entrez un nombre...",
                                                style: 1,
                                                required: true,
                                                maxLength: 50,
                                            },
                                        ],
                                    },
                                ],
                            });
                        } catch (modalError) {
                            logger.error("Failed to show modal:", modalError);
                            if (!i.replied && !i.deferred) {
                                await i.reply({
                                    content: "Échec de l'ouverture de la calculatrice. Veuillez réessayer.",
                                    flags: ["Ephemeral"],
                                }).catch(console.error);
                            }
                            return;
                        }

                    } catch (error) {
                        logger.error("Button interaction error:", error);
                        if (!i.deferred && !i.replied) {
                            await i.followUp({
                                content: "Une erreur est survenue lors du traitement de votre demande.",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                    }
                });

                collector.on("end", (collected, reason) => {
                    if (reason === "timeout") {
                        const disabledRow =
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`calc_${interaction.id}_expired`)
                                    .setLabel("Calculatrice expirée")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(true),
                            );

                        interaction
                            .editReply({
                                components: [disabledRow],
                                content:
                                    "⏱️ Cette calculatrice a expiré. Relancez la commande pour effectuer de nouveaux calculs.",
                            })
                            .catch(console.error);
                    } else {
                        const disabledRow = ActionRowBuilder.from(
                            row,
                        ).setComponents(
                            row.components.map((component) =>
                                ButtonBuilder.from(component).setDisabled(true),
                            ),
                        );

                        interaction
                            .editReply({ components: [disabledRow] })
                            .catch(console.error);
                    }
                });
            } catch (error) {
                logger.error('Calculation error:', error);

                let errorMessage = 'Échec de l\'évaluation de l\'expression. ';

                if (error.message.includes('Unexpected type')) {
                    errorMessage +=
                        'L\'expression contient une fonction ou une opération non supportée.';
                } else if (error.message.includes('Undefined symbol')) {
                    errorMessage +=
                        'L\'expression contient une variable ou une fonction non définie.';
                } else if (error.message.includes('Brackets not balanced')) {
                    errorMessage += 'L\'expression possède des parenthèses ou crochets mal fermés.';
                } else if (
                    error.message.includes('Unexpected operator') ||
                    error.message.includes('Unexpected character')
                ) {
                    errorMessage +=
                        'L\'expression contient un caractère ou un opérateur invalide.';
                } else {
                    errorMessage += 'Veuillez vérifier la syntaxe et réessayer.';
                }

                const embed = errorEmbed('Erreur de calcul', errorMessage);
                embed.setColor(getColor('error'));
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'calculate'
            });
        }
    },
};
