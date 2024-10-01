import { MercadoPagoConfig, Preference } from 'mercadopago';
import axios from 'axios';
import config from '../config/config.js';

const client = new MercadoPagoConfig({ accessToken: config.MERCADOPAGO_ACCESS_TOKEN });

export const createPaymentPreference = async chatId => {
    try {
        const preference = new Preference(client);
        const createdPref = await preference.create({
            body: {
                items: [{
                    title: 'Tirada tarot egipcio',
                    unit_price: 5000,
                    quantity: 1
                }],
                external_reference: chatId,
                notification_url: `${config.APP_DOMAIN}/mp/webhook`,
                back_urls: {
                    success: "https://wa.me/5493517399301"
                }
            }
        });

        return createdPref.init_point;
    } catch (error) {
        console.error('Error al crear la preferencia de pago:', error);
        throw new Error('Error al procesar la solicitud');
    }
};

export const getPaymentByReference = async paymentId => {
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}?access_token=${config.MERCADOPAGO_ACCESS_TOKEN}`;
    try {
        let response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.log(error);
        return null
    }
}