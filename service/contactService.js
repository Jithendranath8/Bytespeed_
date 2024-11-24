const db = require('../config/db');

const identifyContact = async (req, res) => {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
        return res.status(400).json({ error: "Either email or phoneNumber is required" });
    }

    try {
        //Here we Find matching contacts
        const [contacts] = await db.execute(
            'SELECT * FROM Contact WHERE (email = ? OR phoneNumber = ?) AND deletedAt IS NULL',
            [email, phoneNumber]
        );

        if (contacts.length === 0) {
            // IF No matches found, create a new primary contact
            const [insertResult] = await db.execute(
                `INSERT INTO Contact (phoneNumber, email, linkPrecedence, createdAt, updatedAt) 
                 VALUES (?, ?, 'primary', NOW(), NOW())`,
                [phoneNumber, email]
            );

            return res.status(200).json({
                contact: {
                    primaryContactId: insertResult.insertId,
                    emails: email ? [email] : [],
                    phoneNumbers: phoneNumber ? [phoneNumber] : [],
                    secondaryContactIds: [],
                },
            });
        }

        //Determining the primary contact with createdAt 
        const primaryContact = contacts.find(c => c.linkPrecedence === 'primary') 
            || contacts.reduce((oldest, current) =>
                (new Date(oldest.createdAt) < new Date(current.createdAt) ? oldest : current)
            );

        //Fetching all linked contacts
        const [linkedContacts] = await db.execute(
            `SELECT * FROM Contact 
             WHERE (linkedId = ? OR id = ?) AND deletedAt IS NULL`,
            [primaryContact.id, primaryContact.id]
        );

        const allLinkedContacts = new Map();
        [...contacts, ...linkedContacts].forEach(contact => {
            allLinkedContacts.set(contact.id, contact);
        });

        const secondaryContactIds = Array.from(allLinkedContacts.values())
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
            // if new user hits with existing secondary contact details
            // Update all other secondary contacts' `linkedId` to point to the new primary
            const [additionalLinkedContacts] = await db.execute(
                `SELECT * FROM Contact
                 WHERE linkedId IN (${placeholders}) AND deletedAt IS NULL`,
                secondaryContactIds
            );

            const additionalContactIds = additionalLinkedContacts.map(c => c.id);
            if (additionalContactIds.length > 0) {
                const additionalPlaceholders = additionalContactIds.map(() => '?').join(',');
                await db.execute(
                    `UPDATE Contact 
                     SET linkedId = ?, updatedAt = NOW() 
                     WHERE id IN (${additionalPlaceholders})`,
                    [primaryContact.id, ...additionalContactIds]
                );
            }
        }

        //Consolidate/Merging data
        const consolidatedContact = {
            primaryContactId: primaryContact.id,
            emails: Array.from(new Set([...allLinkedContacts.values()]
                .map(contact => contact.email)
                .filter(Boolean))),
            phoneNumbers: Array.from(new Set([...allLinkedContacts.values()]
                .map(contact => contact.phoneNumber)
                .filter(Boolean))),
            secondaryContactIds: Array.from(new Set([...allLinkedContacts.values()]
                .filter(contact => contact.id !== primaryContact.id)
                .map(contact => contact.id))),
        };

        return res.status(200).json({ contact: consolidatedContact });
    } catch (error) {
        console.error("Error identifying contact:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = { identifyContact };
