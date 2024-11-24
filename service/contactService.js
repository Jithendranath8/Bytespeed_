const db = require('../config/db');

const identifyContact = async (req, res) => {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
        return res.status(400).json({ error: "Either email or phoneNumber is required" });
    }

    try {
        // Step 1: Find matching contacts
        const [contacts] = await db.execute(
            'SELECT * FROM Contact WHERE (email = ? OR phoneNumber = ?) AND deletedAt IS NULL',
            [email, phoneNumber]
        );

        if (contacts.length === 0) {
            // No matches found, create a new primary contact
            const [insertResult] = await db.execute(
                `INSERT INTO Contact (phoneNumber, email, linkPrecedence, createdAt, updatedAt) 
                 VALUES (?, ?, 'primary', NOW(), NOW())`,
                [phoneNumber, email]
            );

            const newContactId = insertResult.insertId;

            return res.status(200).json({
                contact: {
                    primaryContactId: newContactId,
                    emails: email ? [email] : [],
                    phoneNumbers: phoneNumber ? [phoneNumber] : [],
                    secondaryContactIds: [],
                },
            });
        }

        // Step 2: Determine the primary contact
        const primaryContact =
            contacts.find(c => c.linkPrecedence === 'primary') ||
            contacts.reduce((oldest, current) =>
                new Date(oldest.createdAt) < new Date(current.createdAt) ? oldest : current
            );

        // Step 3: Fetch all linked contacts
        const [linkedContacts] = await db.execute(
            `SELECT * FROM Contact 
             WHERE (linkedId = ? OR id = ?) AND deletedAt IS NULL`,
            [primaryContact.id, primaryContact.id]
        );

        const allLinkedContacts = [...contacts, ...linkedContacts];

        // Step 4: Update/link secondary contacts
        const secondaryContactIds = allLinkedContacts
            .filter(contact => contact.id !== primaryContact.id && contact.linkPrecedence === 'primary')
            .map(contact => contact.id);

        if (secondaryContactIds.length > 0) {
            const placeholders = secondaryContactIds.map(() => '?').join(',');
            await db.execute(
                `UPDATE Contact 
                 SET linkedId = ?, linkPrecedence = 'secondary', updatedAt = NOW() 
                 WHERE id IN (${placeholders})`,
                [primaryContact.id, ...secondaryContactIds]
            );
        }

        // Step 5: Fetch additional secondary contacts
        const [additionalLinkedContacts] = await db.execute(
            `SELECT * FROM Contact WHERE linkedId = ? AND deletedAt IS NULL`,
            [primaryContact.id]
        );

        const consolidatedContacts = [...allLinkedContacts, ...additionalLinkedContacts];

        // Step 6: Consolidate data
        const consolidatedContact = {
            primaryContactId: primaryContact.id,
            emails: [...new Set(consolidatedContacts.map(contact => contact.email).filter(Boolean))],
            phoneNumbers: [...new Set(consolidatedContacts.map(contact => contact.phoneNumber).filter(Boolean))],
            secondaryContactIds: [...new Set(consolidatedContacts
                .filter(contact => contact.id !== primaryContact.id)
                .map(contact => contact.id))],
        };

        return res.status(200).json({ contact: consolidatedContact });
    } catch (error) {
        console.error("Error identifying contact:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = { identifyContact };
