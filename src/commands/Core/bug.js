import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Signaler un bug ou un problème avec le bot"),

    async execute(interaction) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Signaler un bug sur GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const row = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Rapport de Bug',
            description: 'Vous avez trouvé un bug ? Veuillez le signaler sur notre page GitHub Issues !\n\n' +
            '**Lorsque vous signalez un bug, merci d\'inclure :**\n' +
            '• 📝 Une description détaillée du problème\n' +
            '• 🔄 Les étapes pour reproduire le problème\n' +
            '• 📸 Des captures d\'écran si nécessaire\n' +
            '• ⚙️ La version de votre bot et votre environnement\n\n' +
            'Cela nous aide à corriger les problèmes plus rapidement et plus efficacement !',
            color: 'error'
        })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
            components: [row],
        });
    },
};
