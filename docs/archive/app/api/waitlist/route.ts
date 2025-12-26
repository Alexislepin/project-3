import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Validation basique
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email requis' },
        { status: 400 }
      );
    }

    // Validation format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Format email invalide' },
        { status: 400 }
      );
    }

    // Log pour développement (peut être remplacé par un vrai stockage)
    console.log(`[WAITLIST] Nouvelle inscription: ${email}`);
    console.log(`[WAITLIST] Timestamp: ${new Date().toISOString()}`);

    // TODO: Optionnel - Envoyer un email si WAITLIST_DESTINATION_EMAIL est défini
    // const destinationEmail = process.env.WAITLIST_DESTINATION_EMAIL;
    // if (destinationEmail) {
    //   // Envoyer un email de notification
    // }

    return NextResponse.json(
      { message: 'Inscription réussie', email },
      { status: 200 }
    );
  } catch (error) {
    console.error('[WAITLIST] Erreur:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}










