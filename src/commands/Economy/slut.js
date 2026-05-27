import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Stream Cam", min: 120, max: 450, risk: 0.2 },
    { name: "Session de Danse Privée", min: 220, max: 700, risk: 0.25 },
    { name: "Hôte de Club de Nuit", min: 320, max: 900, risk: 0.3 },
    { name: "Rendez-vous d'Escorte VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "Livestream Exclusif", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Votre stream a cartonné et les pourboires ont plu.",
    "Une réservation VIP a payé bien au-dessus de la moyenne.",
    "Votre service de nuit était complet et très rentable.",
    "Des demandes Premium sont arrivées et vos gains ont grimpé.",
];

const FINE_OUTCOMES = [
    "La sécurité de l'établissement vous a mis une amende de conformité.",
    "Un avertissement de modération a déclenché des frais de plateforme.",
    "Vous avez été signalé et avez dû payer une pénalité.",
];

const ROBBED_OUTCOMES = [
    "La contestation bancaire d'un faux acheteur a annulé une partie de vos gains.",
    "Une fausse réservation a vidé une partie de votre argent liquide.",
    "Vous vous êtes fait piéger par un compte frauduleux et avez perdu de l'argent.",
];

const LOSS_OUTCOMES = [
    "La session a fait un bide et vous avez dû couvrir les frais de fonctionnement.",
    "Vous avez dépensé votre budget dans les préparatifs sans aucun retour sur investissement.",
    "Le service a mal tourné et vous a laissé dans le rouge.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    // Mapping français pour les types de fins dans les titres
    const frTypes = { payout: 'Paiement', fine: 'Amende', robbed: 'Volé', loss: 'Perte' };

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `💰 ${activity.name} - ${frTypes.payout}`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `🚨 ${activity.name} - ${frTypes.fine}`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `🕵️ ${activity.name} - ${frTypes.robbed}`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `❌ ${activity.name} - ${frTypes.loss}`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Accepter un travail provocateur et risqué pour un gain ou une perte aléatoire'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "Impossible de charger vos données économiques. Veuillez réessayer plus tard.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous devez attendre avant de pouvoir retravailler ! Réessayez dans **${Math.ceil(remainingTime / 60000)}** minutes.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **Résultat Net :** ${amountLabel}`,
                `💳 **Solde Actuel :** $${userData.wallet.toLocaleString()}`,
                `📊 **Sessions Totales :** ${userData.totalSluts}`,
                `💵 **Total Gagné :** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **Total Perdu :** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};
