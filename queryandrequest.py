from langchain.prompts.chat import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    AIMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
from langchain.chat_models import ChatOpenAI
from langchain.chains import VectorDBQAWithSourcesChain
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.vectorstores import Qdrant
from qdrant_client import QdrantClient

import os
import sys
import json
from langchain.chains import ChatVectorDBChain
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
os.environ["QDRANT_API_KEY"] = os.getenv("QDRANT_API_KEY")
os.environ["QDRANT_HOST"] = os.getenv("QDRANT_HOST")
# bring in inputs
# text = sys.argv[1]
# bible = sys.argv[2]
# denom = sys.argv[3]
# last_response = sys.argv[4]
# last_prompt = sys.argv[5]

# Parse the JSON input data
data = json.loads(sys.argv[1])

# Extract the values of the properties
text = data['prompt']
bible = data['selectedOption1']
denom = data['selectedOption2']
last_response = data['last_response']
last_prompt = data['last_prompt']
print("#######bible:", bible)


system_template = """Use the following pieces of context to objectively answer the users question.
If you don't know the answer, just say that you don't know, don't try to make up an answer! I repeat, only answer based on the context. 
ALWAYS return a scripture "SOURCES" part in your answer. The scripture "sources" part should be a reference to the verse/verses of the document from which you got your answer.

Example of your response should be:

```
The answer is foo
[line break]
sources: xyz
```

Begin!
----------------
{context}"""
messages = [
    SystemMessagePromptTemplate.from_template(system_template),
    HumanMessagePromptTemplate.from_template("{question}")
]
prompt = ChatPromptTemplate.from_messages(messages)


api_key = os.environ["QDRANT_API_KEY"]
hosturl = os.environ["QDRANT_HOST"]
client = QdrantClient(url=hosturl, prefer_grpc=True, api_key=api_key)
collection_name = bible
embeddings = OpenAIEmbeddings()
vectordb1 = Qdrant(client, collection_name,
                   embedding_function=embeddings.embed_query)
vectortable = vectordb1

qa = ChatVectorDBChain.from_llm(ChatOpenAI(
    temperature=0), vectortable, qa_prompt=prompt, return_source_documents=True)

# chat_history = []
chat_history = [(last_prompt, last_response)]
query = text
result = qa({"question": query, "chat_history": chat_history, })
response = result["answer"]

print("{", response, "}")
print(result['source_documents'])
