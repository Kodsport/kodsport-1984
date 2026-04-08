

## Remove 7 Admin Users

### Users to Remove
| # | Email | Role Row ID |
|---|-------|-------------|
| 1 | arvid.kristoffersson@kodsport.se | `bc3ee23c-9ce0-4c52-b183-e9d73597bc23` |
| 2 | erik.lidman@kodsport.se | `0a05f149-e240-4600-815a-33e4fc67907e` |
| 3 | julia.martensson@ungvetenskapssport.se | `369931ed-34e8-4e38-94ba-7cb2b46c79de` |
| 4 | ellinor.ahlander@kodsport.se | `26c8cfe9-0b3e-455e-a0cf-96ba2928f823` |
| 5 | ruth.risberg@kodsport.se | `5965c40f-837c-489e-8f3f-482ddbab0bbc` |
| 6 | hugoback01@outlook.com | `24ea67ae-f039-4253-a07e-b55a0038721c` |
| 7 | victor.vatn@gmail.com | `eb36a57f-96b7-4a6d-a5c1-27bb6b74d0a0` |

### Remaining Admins After Removal
| Email |
|-------|
| harry.zhang@kodsport.se |
| joshua.andersson@kodsport.se |
| movitz@lovable.dev |
| rasmuswario@gmail.com |

### Action
Single DELETE statement removing all 7 rows by ID, then a SELECT to list remaining admins. No code changes needed.

