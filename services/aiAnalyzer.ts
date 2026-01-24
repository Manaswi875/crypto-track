import prisma from '@/lib/prisma'
import OpenAI from 'openai'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

export class AIAnalyzer {
    async explainMovement(eventId: string, coinId: string, price: number, changePct: number) {
        try {
            // 1. Gather Context (News, recent events, etc.)
            // Note: In a real app, you'd fetch recent news from CryptoPanic or NewsAPI here.
            // For now, we'll provide the stats to the LLM.

            const prompt = `
        Analyze the following cryptocurrency price movement and explain why it might have moved.
        Coin: ${coinId}
        Current Price: $${price}
        Movement: ${changePct.toFixed(2)}% (statistical anomaly detected)
        
        Recent Whale Activity: [To be integrated]
        Recent News: [To be integrated]

        Provide a concise, factual explanation (2-3 sentences). Avoid speculation.
        Format: "Explanation: ..."
      `

            const response = await openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
            })

            const explanation = response.choices[0]?.message?.content?.replace('Explanation: ', '') || 'Movement detected based on statistical deviation.'

            // 2. Update Event with AI Explanation
            await prisma.volatilityEvent.update({
                where: { id: eventId },
                data: { aiExplanation: explanation }
            })

            console.log(`[AI] Explanation for ${coinId}: ${explanation}`)

            // 3. Notify Users (Trigger notification service)
            // notifyUsers(coinId, explanation)
        } catch (error) {
            console.error('AI Analysis failed:', error)
        }
    }
}
