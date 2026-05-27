import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Perche', emoji: '🐟', rarity: 'common' },
    { name: 'Saumon', emoji: '🐟', rarity: 'common' },
    { name: 'Truite', emoji: '🐟', rarity: 'common' },
    { name: 'Thon', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Espadon', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Poulpe', emoji: '🐙', rarity: 'rare' },
    { name: 'Homard', emoji: '🦞', rarity: 'rare' },
    { name: 'Requin', emoji: '🦈', rarity: 'epic' },
    { name: 'Baleine', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "Vous lancez votre ligne dans les eaux cristallines...",
    "Vous attendez patiemment pendant que votre flotteur dérive...",
    "Après quelques minutes d'attente, vous sentez une secousse...",
    "L'eau frémit alors que quelque chose mord à votre hameçon...",
    "Vous moulinez et ramenez votre prise avec une précision d'expert...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Aller pêcher pour attraper des poissons et gagner de l\'argent'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Vous êtes trop fatigué pour pêcher pour le moment. Reposez-vous encore **${hours}h ${minutes}m** avant de relancer votre ligne.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            
            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            
            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Bonus Canne à Pêche : +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const rarityNames = {
                common: 'Commun',
                uncommon: 'Peu Commun',
                rare: 'Rare',
                epic: 'Épique',
                legendary: 'Légendaire'
            };

            const embed = createEmbed({
                title: '🎣 Pêche Réussie !',
                description: `${catchMessage}\n\nVous avez attrapé un(e) **${fishCaught.emoji} ${fishCaught.name}** ! Vous l'avez vendu(e) pour **$${finalEarned.toLocaleString()}** !${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "💵 Nouveau Solde en Liquide",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🐟 Rareté",
                        value: rarityNames[fishCaught.rarity],
                        inline: true,
                    }
                )
                .setFooter({ text: `Prochaine session de pêche disponible dans 45 minutes.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};
