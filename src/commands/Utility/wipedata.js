import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, warningEmbed } from '../../utils/embeds.js';
import { getConfirmationButtons } from '../../utils/components.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('effacerdonnees')
        .setDescription('Supprimer toutes vos données personnelles du bot (irréversible)'),

    async execute(interaction, guildConfig, client) {
        try {
            const warningMessage = 
                `⚠️ **CETTE ACTION EST IRRÉVERSIBLE !** ⚠️\n\n` +
                `Ceci supprimera définitivement **TOUTES** vos données de ce serveur, notamment :\n` +
                `• 💰 Solde économique (portefeuille & banque)\n` +
                `• 📊 Niveaux et XP\n` +
                `• 🎒 Objets de l'inventaire\n` +
                `• 🛍️ Achats en boutique\n` +
                `• 🎂 Informations d'anniversaire\n` +
                `• 🔢 Données de compteur\n` +
                `• 📋 Toutes les autres données personnelles\n\n` +
                `**Cette action ne peut pas être annulée. Êtes-vous absolument sûr(e) ?**`;

            const embed = warningEmbed(warningMessage, '🗑️ Effacer toutes les données');

            const confirmButtons = getConfirmationButtons('effacerdonnees');

            await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                components: [confirmButtons],
                flags: MessageFlags.Ephemeral
            });

            logger.info(`Wipedata command executed - confirmation prompt shown`, {
                userId: interaction.user.id,
                guildId: interaction.guildId
            });
        } catch (error) {
            logger.error(`Wipedata command execution failed`, {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'effacerdonnees'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'effacerdonnees',
                source: 'wipedata_command'
            });
        }
    }
};
