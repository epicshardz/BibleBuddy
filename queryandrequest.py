from langchain.prompts.chat import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    AIMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
from langchain.chat_models import ChatOpenAI
from langchain.chains import VectorDBQAWithSourcesChain
from langchain.embeddings.openai import OpenAIEmbeddings
# from langchain.vectorstores import Chroma
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
text = sys.argv[1]
bible = sys.argv[2]
denom = sys.argv[3]
last_response = sys.argv[4]
last_prompt = sys.argv[5]
print("#######bible:", bible)


system_template = """Use the following pieces of context to answer the users question. 
If you don't know the answer, just say that you don't know, don't try to make up an answer! I repeat, only answer based on the context. If its useful, the last response you gave was {last_response}, if its not useful, just ignore I said anything about it.
ALWAYS return a scripture "SOURCES" part in your answer.
The scripture "sources" part should be a reference to the verse/verses of the document from which you got your answer.

Example of your response should be:

```
The answer is foo
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

embedding = OpenAIEmbeddings()

# persist_directory = "db/Bibles/Collections/" + bible
# print(persist_directory)
# Now we can load the persisted database from disk, and use it as normal.
# vectordb1 = Chroma(persist_directory=persist_directory,
#                    embedding_function=embedding)


# host = "biblebuddycluster"
api_key = os.environ["QDRANT_API_KEY"]
hosturl = os.environ["QDRANT_HOST"]
client = QdrantClient(url=hosturl, prefer_grpc=True, api_key=api_key)
collection_name = bible
embeddings = OpenAIEmbeddings()
vectordb1 = Qdrant(client, collection_name,
                   embedding_function=embeddings.embed_query)
# Future
# if denom == "Non-Denominational":
#     vectortable = vectordb1
# else:
#     persist_directory = 'db/Denominations/Collections/{denom}'
#     # Now we can load the persisted database from disk, and use it as normal.
#     vectordb2 = Chroma(persist_directory=persist_directory,
#                        embedding_function=embedding)
##########
vectortable = vectordb1
# chain_type_kwargs = {"prompt": prompt}


# def get_chat_history(inputs) -> str:
#     res = []
#     for human, ai in inputs:
#         res.append(f"Human:{human}\nAI:{ai}")
#     return "\n".join(res)


qa = ChatVectorDBChain.from_llm(ChatOpenAI(
    temperature=0), vectortable, qa_prompt=prompt, return_source_documents=True)

# chain = VectorDBQAWithSourcesChain.from_chain_type(
#     ChatOpenAI(temperature=0),
#     chain_type="stuff",
#     # chain_type="map_reduce",
#     vectorstore=vectortable,
#     chain_type_kwargs=chain_type_kwargs,
#     verbose=False
#     # max_tokens_limit=3000,
#     # reduce_k_below_max_tokens=True
#     # memory=ConversationalBufferWindowMemory(k=2)
# )


# if not last_response or last_response.isspace() or not last_prompt:
#     chat_history = []
# else:
#     chat_history = [(last_prompt, last_response)]
chat_history = []
# chat_history = []
query = text
result = qa({"question": query, "chat_history": chat_history,
            "last_response": last_response})
response = result["answer"]

# response = chain({"question": text}, return_only_outputs=True)

# print the response text
# print(texty)
# output = {
#     'answer': response['answer'],
#     'sources': response['sources']
# # }
# if 'sources' not in response or not response['sources']:
#     cleaned_text = response['answer']
# else:
#     cleaned_text = response['answer'] + 'Sources: ' + response['sources']


# cleaned_text = response['answer'] + 'Sources: ' + response['sources']

print("{", response, "}")
print(result['source_documents'])
