import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('generatepassword')
        .setDescription('Générer un mot de passe fort et aléatoire')
        .addIntegerOption(option =>
            option.setName('length')
                .setDescription('Longueur du mot de passe (défaut : 16, max : 50)')
                .setMinValue(8)
                .setMaxValue(50)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('uppercase')
                .setDescription('Inclure des lettres majuscules (A-Z)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('numbers')
                .setDescription('Inclure des chiffres (0-9)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('symbols')
                .setDescription('Inclure des symboles (!@#$%^&*)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });

        if (!deferSuccess) {
            logger.warn('GeneratePassword interaction defer failed', {
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                commandName: 'generatepassword'
            });
            return;
        }

        try {
            const length = interaction.options.getInteger('length') || 16;
            const includeUppercase = interaction.options.getBoolean('uppercase') ?? true;
            const includeNumbers = interaction.options.getBoolean('numbers') ?? true;
            const includeSymbols = interaction.options.getBoolean('symbols') ?? true;
            
            if (length < 8 || length > 50) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('❌ Longueur invalide', 'Le mot de passe doit contenir entre 8 et 50 caractères. Vous avez fourni : ' + length)],
                });
                return;
            }
            
            const lowercase = 'abcdefghijklmnopqrstuvwxyz';
            const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const numbers = '0123456789';
            const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            
            let chars = lowercase;
            if (includeUppercase) chars += uppercase;
            if (includeNumbers) chars += numbers;
            if (includeSymbols) chars += symbols;
            
            let password = '';
            const randomValues = new Uint32Array(length);
            crypto.getRandomValues(randomValues);
            
            for (let i = 0; i < length; i++) {
                const randomIndex = randomValues[i] % chars.length;
                password += chars[randomIndex];
            }
            
            if (includeUppercase && !/[A-Z]/.test(password)) {
                const randomIndex = Math.floor(Math.random() * length);
                const randomUpper = uppercase[Math.floor(Math.random() * uppercase.length)];
                password = password.substring(0, randomIndex) + randomUpper + password.substring(randomIndex + 1);
            }
            
            if (includeNumbers && !/[0-9]/.test(password)) {
                const randomIndex = Math.floor(Math.random() * length);
                const randomNumber = numbers[Math.floor(Math.random() * numbers.length)];
                password = password.substring(0, randomIndex) + randomNumber + password.substring(randomIndex + 1);
            }
            
            if (includeSymbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
                const randomIndex = Math.floor(Math.random() * length);
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                password = password.substring(0, randomIndex) + randomSymbol + password.substring(randomIndex + 1);
            }
            
            let strength = 'Faible';
            let strengthEmoji = '🔴';
            let strengthColor = getColor('error');
            
            const hasLower = /[a-z]/.test(password);
            const hasUpper = /[A-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSymbol = /[^a-zA-Z0-9]/.test(password);
            
            const uniqueChars = new Set(password).size;
            const uniqueRatio = uniqueChars / password.length;
            
            let score = 0;
            score += password.length * 4;
            score += (password.length - (password.match(/[a-z]/g) || []).length) * 2;
            score += (password.length - (password.match(/[A-Z]/g) || []).length) * 2;
            score += (password.match(/[0-9]/g) || []).length * 4;
            score += (password.match(/[^a-zA-Z0-9]/g) || []).length * 6;
            
            if (uniqueRatio < 0.5) score *= 0.7;
            if (hasLower && hasUpper) score *= 1.2;
            if (hasNumber) score *= 1.2;
            if (hasSymbol) score *= 1.3;
            
            if (score > 80) {
                strength = 'Très fort';
                strengthEmoji = '🟢';
                strengthColor = getColor('success');
            } else if (score > 60) {
                strength = 'Fort';
                strengthEmoji = '🟢';
                strengthColor = getColor('success');
            } else if (score > 40) {
                strength = 'Bon';
                strengthEmoji = '🟡';
                strengthColor = getColor('warning');
            } else if (score > 20) {
                strength = 'Faible';
                strengthEmoji = '🟠';
                strengthColor = getColor('warning');
            }
            
            // Formatage de la liste des types inclus pour éviter les virgules au début
            const inclusionList = [];
            if (hasLower) inclusionList.push('Minuscules');
            if (hasUpper) inclusionList.push('Majuscules');
            if (hasNumber) inclusionList.push('Chiffres');
            if (hasSymbol) inclusionList.push('Symboles');
            
            const embed = successEmbed(
                '🔑 Mot de passe généré',
                `**Mot de passe :** ||\`${password}\`||\n` +
                `**Longueur :** ${password.length} caractères\n` +
                `**Force :** ${strengthEmoji} ${strength}\n` +
                `**Contient :** ${inclusionList.join(', ')}`
            ).setColor(strengthColor);
            
            await InteractionHelper.safeEditReply(interaction, { 
                embeds: [embed],
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'generatepassword'
            });
        }
    },
};
