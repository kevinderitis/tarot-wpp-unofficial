import pkg from 'whatsapp-web.js';
import { Router } from 'express';
import { prepareCards } from '../services/cardServices.js';
import { prepareCardName } from '../templates/cards.js';
import { botMsg } from '../services/gptServices.js';
import { createWelcomeMessage, createPaymentMessage } from '../services/leadServices.js';
import { validateLeadPayment } from '../services/leadServices.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createLead, getLeadByChatId } from '../dao/leadDAO.js';

const { Client, LocalAuth, MessageMedia } = pkg;
const whatsappRouter = Router();

// const rutaImagenes = path.join('public', 'images');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rutaImagenes = path.join(__dirname, '../../public', 'images');

const unavailableSenders = new Set();

let client = new Client({
    authStrategy: new LocalAuth({ clientId: `client-0206` }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        // executablePath: process.env.CHROME_BIN || null
    },
    webVersionCache: {
        type: "remote",
        remotePath:
            "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014587000-alpha.html",
    },
});

let qrData;

export const initializeClient = () => {
    client.on('qr', async (qr) => {
        qrData = qr;
        console.log(`Este es la data de qr: ${qrData}`);
    });

    client.on('ready', async () => {
        console.log('Client is ready!');
    });

    client.on('disconnected', async (reason) => {
        console.log('Cliente desconectado:', reason);
    });

    client.on('message', async (message) => {
        try {
            const messageId = message.id._serialized;
            const messageText = message.body;
            const sender = message.from;

            console.log(`Numero de telefono: ${sender}`);
            console.log(`Mensaje: ${messageText}`);

            const lead = await getLeadByChatId(sender);
            if (!lead) {
                console.log(`El sender ${sender} no esta registrado.`);
                let welcomeMessage = await createWelcomeMessage(sender);
                let newLead = await createLead(sender);
                if (newLead) {
                    await sendMessageUnofficial(sender, welcomeMessage);
                }
                return;
            }

            const hasPaid = await validateLeadPayment(sender);
            if (!hasPaid) {
                console.log(`El sender ${sender} no ha realizado el pago.`);
                let welcomeMessage = await createPaymentMessage(sender);
                await sendMessageUnofficial(sender, welcomeMessage);
                return;
            }

            console.log('El sender ha pagado, continuando...');


            if (message.from && !unavailableSenders.has(sender)) {
                console.log('Available sender')
                unavailableSenders.add(sender);
                let response = await botMsg(messageText, sender);

                if (response === 'function') {
                    response = await botMsg(messageText, sender);
                }

                let cards = prepareCards(response);
                let delay = 20000;

                if (cards.length > 1) {
                    sendMultipleMessages(sender, cards, delay)
                } else {
                    setTimeout(async () => {
                        await sendMessageUnofficial(sender, response);
                        console.log(`Single message from : ${sender} - msg: ${response}`)
                    }, 8000);
                }
                unavailableSenders.delete(sender);
            } else {
                console.log('Unavailable sender');
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    client.initialize();
};

whatsappRouter.get('/qr', async (req, res) => {
    try {
        res.render('qr-code', { qrText: qrData });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating QR code');
    }
});

whatsappRouter.get('/shutdown', async (req, res) => {
    try {
        await client.destroy();
        console.log('Client has been shut down');
        initializeClient();
        console.log('Client has been restarted');
        res.send('Client has been restarted');
    } catch (error) {
        console.error('Error shutting down client:', error);
        res.status(500).send('Error shutting down client');
    }
});

export const sendMultipleMessages = (chatId, mensajes, tiempoDeEspera) => {
    mensajes.forEach((mensaje, index) => {
        setTimeout(async () => {
            if (mensaje.carta) {
                let cardName = prepareCardName(mensaje.carta);
                const imageName = cardName ? `${cardName}.jpg` : 'defaultCard.jpg';
                const imagePath = path.join(rutaImagenes, imageName);
                try {
                    // const newImagePath = imagePath.replace(/\\/g, '/');
                    // await sendMessageUnofficial(chatId, mensaje.carta, newImagePath);
                    await sendMessageUnofficial(chatId, mensaje.carta, imagePath);
                    console.log(`Image message from : ${chatId} - msg: ${mensaje.carta}`)
                    setTimeout(async () => {
                        await sendMessageUnofficial(chatId, mensaje.texto);
                        console.log(`Multi message from : ${chatId} - msg: ${mensaje.texto}`)
                    }, 5000);
                } catch (error) {
                    console.log(error);
                }

            } else {
                let msg = mensaje.carta ? `La carta es: ${mensaje.carta} ${mensaje.texto}` : mensaje.texto;
                console.log(`Message from : ${chatId} - msg: ${msg}`)
                await sendMessageUnofficial(chatId, msg);
            }
        }, tiempoDeEspera * index);
    });
};

const getRandomTypingTime = () => {
    const min = 5000;
    const max = 10000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const sendMessageUnofficial = async (to, message, mediaUrl) => {
    try {
        if (!to || !message) {
            throw new Error('El destinatario y el mensaje son obligatorios.');
        }

        const typingTime = getRandomTypingTime();
        const chat = await client.getChatById(to);

        if (chat) {
            await client.sendPresenceAvailable();
            await chat.sendStateTyping();

            await new Promise(resolve => setTimeout(resolve, typingTime));

            await chat.clearState();
            await client.sendPresenceUnavailable();

        } else {
            console.log('Chat id no encontrado.');
        }

        if (mediaUrl) {
            // const mediaData = await fetch(mediaUrl).then(response => response.buffer());
            const mediaData = fs.readFileSync(mediaUrl);
            const base64 = mediaData.toString('base64');
            const mimeType = 'image/jpeg';

            const mediaMessage = new MessageMedia(mimeType, base64);

            await client.sendMessage(to, mediaMessage, { caption: message });
        } else {
            await client.sendMessage(to, message);
        }

        console.log('Mensaje enviado con éxito.');
    } catch (error) {
        console.error('Error enviando el mensaje:', error);
    }
};

export default whatsappRouter;