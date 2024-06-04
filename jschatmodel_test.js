const BibleBuddyQAQA = require('./conversationalQAchain.js'); // Adjust the path accordingly

(async () => {
    const bibleQA = new BibleBuddyQAQA();
    const inputData = {
        prompt: "What is faith?",
        last_response: "",
        last_prompt: "",
        selectedOption1: "KJV",
        selectedOption3: "Slow and quality Answers - GPT-4"
    };

    try {
        const response = await bibleQA.getAnswer(inputData);
        console.log(response);
    } catch (error) {
        console.error(error);
    }
})();