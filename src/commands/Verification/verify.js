import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verification')
        .setDescription('Vérifiez votre compte pour accéder au serveur'),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const guild = interaction.guild;

            const result = await verifyUser(client, guild.id, interaction.user.id, {
                source: 'command_self',
                moderatorId: null
            });

            if (!result.success) {
                if (result.alreadyVerified) {
                    return await InteractionHelper.safeReply(interaction, {
                        embeds: [infoEmbed("Déjà vérifié", "Vous êtes déjà vérifié sur ce serveur.")],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed(
                        "Échec de la vérification",
                        "Une erreur est survenue lors de la vérification. Veuillez réessayer ou contacter un administrateur."
                    )],
                    flags: MessageFlags.Ephemeral
                });
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    "Vérification terminée",
                    `Vous avez été vérifié et avez reçu le rôle **${result.roleName}** ! Bienvenue sur le serveur ! 🎉`
                )],
                flags: MessageFlags.Ephemeral
            });
        }, { command: 'verification' });

        return await wrappedExecute(interaction, config, client);
    }
};
