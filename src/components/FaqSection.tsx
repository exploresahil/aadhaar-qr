"use client";

import { useState } from "react";
import styles from "./faqSection.module.scss";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What is UIDAI Secure QR Code?",
    answer:
      "UIDAI Secure QR Code is a digitally signed code present on e-Aadhaar and print letters. It contains resident demographics (Name, DoB, Gender, Address) along with a compressed JP2000 photograph and SHA-256 hashes of mobile/email.",
  },
  {
    question: "How is the data verified?",
    answer:
      "The QR payload is signed with UIDAI's digital signature using SHA256withRSA. The signature (256 bytes) is embedded at the end of the byte array and can be validated using UIDAI's public key.",
  },
  {
    question: "What format is the photo stored in?",
    answer:
      "The resident photo is stored as a compressed face image in JPEG 2000 (JP2000) format embedded directly after the demographic text fields in the QR byte stream.",
  },
  {
    question: "Is offline verification supported?",
    answer:
      "Yes! Because all demographic data and photograph are contained directly inside the signed QR payload, offline verification can be performed without internet access or contacting UIDAI servers.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className={styles.faqSection}>
      <h2 className={styles.title}>FREQUENTLY ASKED QUESTIONS</h2>
      <div className={styles.accordionList}>
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={faq.question} className={styles.faqItem}>
              <button
                type="button"
                className={styles.questionBtn}
                onClick={() => toggleFaq(index)}
              >
                <span>{faq.question}</span>
                <span className={styles.icon}>{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && <div className={styles.answerBody}>{faq.answer}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
